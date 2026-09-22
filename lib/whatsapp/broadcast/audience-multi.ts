/**
 * WhatsApp Broadcast V1.1 — multi-source audience resolution.
 *
 * A NEW LAYER ON TOP OF V1, not a replacement. It feeds the SAME snapshot
 * mechanism, uses the SAME `decideEligibility()` tree, the SAME
 * `normalizePhoneE164()`, the SAME template resolver, and produces rows for
 * the SAME `whatsapp_broadcast_recipients` table. V1's `resolveAudience()`
 * in audience.ts is untouched and still serves every V1-shaped (filter-only)
 * broadcast — see `hasMultiSourceSelection()` in selection.ts.
 *
 * ── THE THREE SOURCES ───────────────────────────────────────────────────
 *   LEAD             — Prisma `Lead` rows, by explicit id and/or by the V1
 *                      service/branch filter with the derived country-prefix
 *                      filter. Opt-out signal: Lead.marketingOptOut.
 *   VISA_APPLICATION — Prisma `VisaApplication` rows, by explicit id and/or
 *                      by destination/type/status/staff/branch/date filter.
 *                      Contact field: VisaApplication.phone. Opt-out signal:
 *                      VisaApplication.marketingOptOut (a real column).
 *                      Resolved DIRECTLY — no synthetic Lead is ever minted
 *                      to route a visa applicant through the pipeline.
 *   MANUAL           — staff-typed numbers. No record is created for them,
 *                      anywhere, ever.
 *
 * ── SELECTABLE vs ELIGIBLE_TO_SEND ──────────────────────────────────────
 * SELECTION is what the browser sent: ids and filters. It is never gated by
 * consent — the search routes that feed it return every real match whatever
 * their consent status, so staff can build a list and SEE who will be
 * excluded and why.
 *
 * ELIGIBILITY is computed HERE, and only here, over the records this
 * function reads back from the database itself. It is computed at preview
 * time for display and again, authoritatively, at snapshot time. The two
 * concerns share no code path and no data field: nothing in the
 * `AudienceSelection` shape can carry an eligibility claim, and nothing in
 * this file consults one.
 *
 * ── CONSENT IS NOT NEGOTIABLE HERE ──────────────────────────────────────
 * Every identity, from every source, passes through the unmodified
 * `decideEligibility()`: opt-out first and always, then a usable number,
 * then a SUBSCRIBED row in whatsapp_consents keyed on the number. There is
 * no parameter, flag, category, source type or caller that skips or narrows
 * it. A manual number gets exactly the same check as a Lead. The recorded
 * Meta template category (see sources.ts) is never read by this file.
 */

import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import {
  MAX_AUDIENCE_SIZE,
  matchesCountry,
  maskNumber,
  type TargetFilter,
} from './audience'
import { decideEligibility, SKIP_REASON_TO_STATUS, type ConsentStatus, type SkipReason } from './consent'
import { parseManualNumbers, type ManualNumberParseResult } from './manual-numbers'
import {
  normalizeProvenance,
  sourcePriority,
  type RecipientProvenanceEntry,
  type RecipientSourceType,
} from './sources'
import { resolveTemplateParams, type LeadTemplateField, type TemplateDefinition } from './template'
import type { AudienceSelection, VisaTargetFilter } from './selection'

// ── Resolved shapes ─────────────────────────────────────────────────────

/** The template-fillable fields an identity can offer, from any source. */
type TemplateFields = Partial<Record<LeadTemplateField, string | null>>

/**
 * One CONTRIBUTOR: a single source record that named one phone number.
 * Several contributors collapse into one recipient when they share a
 * number — that collapse is the dedup guarantee.
 */
interface Contributor {
  sourceType: RecipientSourceType
  /** Lead.id / VisaApplication.id — null for MANUAL. */
  sourceId: string | null
  label: string | null
  rawNumber: string | null
  normalizedNumber: string | null
  /** The opt-OUT flag carried by THIS record. OR-merged across the group. */
  marketingOptOut: boolean
  fields: TemplateFields
  /** Staff-typed name on a MANUAL entry; null otherwise. */
  displayName: string | null
}

export interface MultiSourceRecipient {
  leadId: string | null
  visaApplicationId: string | null
  /** The highest-priority contributing source (see SOURCE_MERGE_PRIORITY). */
  sourceType: RecipientSourceType
  sourceProvenance: RecipientProvenanceEntry[]
  displayName: string | null
  normalizedNumber: string | null
  waId: string | null
  templateParamsSnapshot: string[]
  status: string
  skipReason: SkipReason | null
  /** A sentence a staff member can act on. Null when the recipient is sendable. */
  exclusionReason: string | null
}

/** One excluded bucket, with a REASON, not just a number. */
export interface ExclusionBucket {
  reason: string
  count: number
  description: string
}

export interface MultiSourceBreakdown {
  /**
   * Everything the selection put in, before anything was dropped:
   * contributors + country-filtered leads + manual entries the server
   * rejected + manual entries repeated inside the paste.
   */
  totalSelected: number
  /** Contributors surviving source-level filtering (i.e. minus countryFiltered). */
  totalMatched: number
  /** Distinct identities holding a usable E.164 number. */
  validNumber: number
  /** Distinct identities with affirmative consent AND a usable number. */
  eligible: number
  optedOut: number
  missingConsent: number
  invalidNumber: number
  /**
   * Contributors collapsed away because they shared a number with another —
   * across sources AND within one manual paste.
   */
  duplicatesRemoved: number
  /** Manual entries the server could not read as an E.164 number. */
  manualRejected: number
  /** Bulk-filter leads dropped because their number is not in the chosen country. */
  countryFiltered: number
  templateUnresolvable: number
  /** What will actually be dispatched. Equals `eligible` minus template failures. */
  finalSendCount: number
  /** Contributors contributed by each source, before dedup. */
  bySource: Record<RecipientSourceType, number>
  /** Distinct identities whose winning source is each type, after dedup. */
  sendableBySource: Record<RecipientSourceType, number>
  /** Human-readable exclusion reasons. Never a bare count. */
  exclusions: ExclusionBucket[]
}

export interface MultiSourceResolution {
  breakdown: MultiSourceBreakdown
  recipients: MultiSourceRecipient[]
  sample: Array<{
    maskedNumber: string
    status: string
    sourceType: RecipientSourceType
    sources: RecipientSourceType[]
    displayName: string | null
    reason: string | null
  }>
  /** The server's own verdict on the manual batch — never the browser's. */
  manual: ManualNumberParseResult
}

function emptySourceCounts(): Record<RecipientSourceType, number> {
  return { CLIENT: 0, LEAD: 0, VISA_APPLICATION: 0, MANUAL: 0 }
}

// ── Source loaders ──────────────────────────────────────────────────────

type LeadRow = {
  id: string
  name: string | null
  whatsapp: string | null
  service: string | null
  branch: string | null
  destination: string | null
  travelDate: string | null
  marketingOptOut: boolean
}

const LEAD_SELECT = {
  id: true,
  name: true,
  whatsapp: true,
  service: true,
  branch: true,
  destination: true,
  travelDate: true,
  marketingOptOut: true,
} as const

type VisaRow = {
  id: string
  referenceNumber: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  destinationIso2: string
  visaType: string
  status: string
  arrivalDate: Date | null
  marketingOptOut: boolean
}

const VISA_SELECT = {
  id: true,
  referenceNumber: true,
  firstName: true,
  lastName: true,
  phone: true,
  destinationIso2: true,
  visaType: true,
  status: true,
  arrivalDate: true,
  marketingOptOut: true,
} as const

/** Build the Prisma `where` for the VisaApplication bulk filter. */
export function buildVisaWhere(f: VisaTargetFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (f.destinationIso2) where.destinationIso2 = f.destinationIso2
  if (f.visaType) where.visaType = f.visaType
  if (f.status) where.status = f.status
  if (f.assignedTo) where.assignedTo = f.assignedTo
  if (f.branch) where.branch = f.branch
  const gte = f.createdFrom ? new Date(f.createdFrom) : null
  const lte = f.createdTo ? new Date(f.createdTo) : null
  const range: Record<string, Date> = {}
  if (gte && !Number.isNaN(gte.getTime())) range.gte = gte
  if (lte && !Number.isNaN(lte.getTime())) range.lte = lte
  if (Object.keys(range).length > 0) where.createdAt = range
  return where
}

/** Build the Prisma `where` for the V1 Lead bulk filter (service/branch only). */
export function buildLeadWhere(f: TargetFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (f.service) where.service = f.service
  if (f.branch) where.branch = f.branch
  // `country` is NOT a Lead column — it is applied after normalization from
  // the dialling prefix, exactly as V1 does. See audience.ts.
  return where
}

function leadContributor(lead: LeadRow): Contributor {
  return {
    sourceType: 'LEAD',
    sourceId: lead.id,
    label: lead.name ?? null,
    rawNumber: lead.whatsapp,
    normalizedNumber: normalizePhoneE164(lead.whatsapp),
    marketingOptOut: lead.marketingOptOut,
    fields: {
      name: lead.name,
      destination: lead.destination,
      service: lead.service,
      travelDate: lead.travelDate,
    },
    displayName: null,
  }
}

function visaContributor(app: VisaRow): Contributor {
  const fullName = [app.firstName, app.lastName].filter(Boolean).join(' ').trim() || null
  return {
    sourceType: 'VISA_APPLICATION',
    sourceId: app.id,
    label: fullName ?? app.referenceNumber,
    rawNumber: app.phone,
    // VisaApplication has NO dedicated WhatsApp column — `phone` is the
    // applicant's contact number and is what the existing admin UI already
    // opens a WhatsApp chat with. `whatsappBsuid` is Meta's username field,
    // not a phone number, and is deliberately not used here.
    normalizedNumber: normalizePhoneE164(app.phone),
    marketingOptOut: app.marketingOptOut,
    fields: {
      name: fullName,
      // The ISO2 destination code as stored. See the release notes: there
      // is no server-side ISO2→country-name table this feature can honestly
      // reuse, so the code is passed through rather than a guessed name.
      destination: app.destinationIso2 || null,
      // Not invented: a visa application IS the "Visa Processing" service
      // in this business's own Lead.service vocabulary.
      service: 'Visa Processing',
      travelDate: app.arrivalDate ? app.arrivalDate.toISOString().slice(0, 10) : null,
    },
    displayName: null,
  }
}

// ── The resolver ────────────────────────────────────────────────────────

/**
 * Resolve a multi-source selection into the exact recipient rows that will
 * be snapshotted.
 *
 * Preview and snapshot call THIS SAME FUNCTION, so what an approver sees is
 * what gets frozen — the V1 property, preserved across three sources.
 *
 * `template` is optional: the preview can run before a template is chosen,
 * in which case parameter resolution (and the templateUnresolvable bucket)
 * is skipped.
 */
export async function resolveMultiSourceAudience(input: {
  selection: AudienceSelection
  template?: TemplateDefinition | null
}): Promise<MultiSourceResolution> {
  const sel = input.selection
  const contributors: Contributor[] = []
  const bySource = emptySourceCounts()
  let countryFiltered = 0

  // ── 1. LEAD source ────────────────────────────────────────────────────
  // Explicit ids and the bulk filter are loaded separately and then merged
  // by lead id, so a lead that is both individually ticked and inside the
  // filter is ONE contributor, not two.
  const leadRows = new Map<string, LeadRow>()
  /** Lead ids that arrived via the BULK filter (country filter applies). */
  const fromLeadFilter = new Set<string>()
  const explicitLeadIds = new Set(sel.leadIds ?? [])

  if (sel.leadIds && sel.leadIds.length > 0) {
    const rows = (await prisma.lead.findMany({
      where: { id: { in: sel.leadIds } },
      select: LEAD_SELECT,
      take: MAX_AUDIENCE_SIZE,
    })) as LeadRow[]
    for (const r of rows) leadRows.set(r.id, r)
  }

  if (sel.useLeadFilter) {
    const rows = (await prisma.lead.findMany({
      where: buildLeadWhere(sel.leadFilter ?? {}),
      select: LEAD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: MAX_AUDIENCE_SIZE,
    })) as LeadRow[]
    for (const r of rows) {
      if (!leadRows.has(r.id)) leadRows.set(r.id, r)
      fromLeadFilter.add(r.id)
    }
  }

  for (const lead of leadRows.values()) {
    const c = leadContributor(lead)
    // The derived country filter is a property of the BULK filter, so it is
    // applied only to leads that arrived through it. A lead a staff member
    // individually ticked is never silently dropped by a filter they did not
    // match them with.
    const onlyFromFilter = fromLeadFilter.has(lead.id) && !explicitLeadIds.has(lead.id)
    if (onlyFromFilter && sel.leadFilter?.country && !matchesCountry(c.normalizedNumber, sel.leadFilter.country)) {
      countryFiltered += 1
      continue
    }
    contributors.push(c)
    bySource.LEAD += 1
  }

  // ── 2. VISA_APPLICATION source ────────────────────────────────────────
  const visaRows = new Map<string, VisaRow>()

  if (sel.visaApplicationIds && sel.visaApplicationIds.length > 0) {
    const rows = (await prisma.visaApplication.findMany({
      where: { id: { in: sel.visaApplicationIds } },
      select: VISA_SELECT,
      take: MAX_AUDIENCE_SIZE,
    })) as VisaRow[]
    for (const r of rows) visaRows.set(r.id, r)
  }

  if (sel.useVisaFilter) {
    const rows = (await prisma.visaApplication.findMany({
      where: buildVisaWhere(sel.visaFilter ?? {}),
      select: VISA_SELECT,
      orderBy: { createdAt: 'desc' },
      take: MAX_AUDIENCE_SIZE,
    })) as VisaRow[]
    for (const r of rows) if (!visaRows.has(r.id)) visaRows.set(r.id, r)
  }

  for (const app of visaRows.values()) {
    contributors.push(visaContributor(app))
    bySource.VISA_APPLICATION += 1
  }

  // ── 3. MANUAL source ──────────────────────────────────────────────────
  // Re-parsed here, server-side, from the RAW strings. Whatever the browser
  // decided about validity is neither sent nor consulted.
  const manual = parseManualNumbers(sel.manualEntries ?? [])
  for (const m of manual.valid) {
    contributors.push({
      sourceType: 'MANUAL',
      sourceId: null,
      label: m.displayName ?? m.normalizedNumber,
      rawNumber: m.raw,
      normalizedNumber: m.normalizedNumber,
      // A manual entry carries no opt-out signal of its own. It is NOT
      // thereby consented: the consent lookup below still applies in full,
      // and a number with no SUBSCRIBED row is NO_CONSENT like any other.
      marketingOptOut: false,
      fields: { name: m.displayName },
      displayName: m.displayName,
    })
    bySource.MANUAL += 1
  }
  // An entry the server could not normalize never becomes a contributor and
  // never reaches the snapshot; it is reported back in `manual.invalid` with
  // a reason a human can fix.

  const breakdown: MultiSourceBreakdown = {
    totalSelected:
      contributors.length + countryFiltered + manual.invalid.length + manual.duplicates.length,
    totalMatched: contributors.length,
    validNumber: 0,
    eligible: 0,
    optedOut: 0,
    missingConsent: 0,
    invalidNumber: 0,
    // Numbers typed twice inside one paste are duplicates just as much as a
    // number contributed by two different sources — counted in one place.
    duplicatesRemoved: manual.duplicates.length,
    manualRejected: manual.invalid.length,
    countryFiltered,
    templateUnresolvable: 0,
    finalSendCount: 0,
    bySource,
    sendableBySource: emptySourceCounts(),
    exclusions: [],
  }

  // ── 4. DEDUPLICATION by canonical normalized number. ──────────────────
  // Not by database id and not by name: the same human legitimately appears
  // as a Lead row, a VisaApplication row and a pasted number at once, and
  // WhatsApp delivers to the NUMBER. One number, one recipient, one
  // message — whatever combination of sources produced it.
  //
  // Contributors with NO usable number cannot be keyed on one, so each gets
  // its own unsendable row (Postgres treats NULLs as DISTINCT under
  // UNIQUE(broadcast_id, normalized_number), so they coexist).
  const groups = new Map<string, Contributor[]>()
  const numberless: Contributor[] = []
  for (const c of contributors) {
    if (!c.normalizedNumber) {
      numberless.push(c)
      continue
    }
    const g = groups.get(c.normalizedNumber)
    if (g) {
      g.push(c)
      breakdown.duplicatesRemoved += 1
    } else {
      groups.set(c.normalizedNumber, [c])
    }
  }
  breakdown.validNumber = groups.size

  // ── 5. One consent lookup for every surviving number. ─────────────────
  const numbers = Array.from(groups.keys())
  const consentRows =
    numbers.length > 0
      ? await prisma.whatsAppConsent.findMany({
          where: { normalizedNumber: { in: numbers } },
          select: { normalizedNumber: true, status: true },
        })
      : []
  const consentByNumber = new Map<string, { status: ConsentStatus }>(
    consentRows.map(r => [r.normalizedNumber, { status: r.status as ConsentStatus }]),
  )

  const recipients: MultiSourceRecipient[] = []

  // ── 6. Unsendable, numberless contributors. ───────────────────────────
  for (const c of numberless) {
    breakdown.invalidNumber += 1
    recipients.push({
      leadId: c.sourceType === 'LEAD' ? c.sourceId : null,
      visaApplicationId: c.sourceType === 'VISA_APPLICATION' ? c.sourceId : null,
      sourceType: c.sourceType,
      sourceProvenance: [{ type: c.sourceType, id: c.sourceId, label: c.label }],
      displayName: c.displayName,
      normalizedNumber: null,
      waId: null,
      templateParamsSnapshot: [],
      status: SKIP_REASON_TO_STATUS.INVALID_NUMBER,
      skipReason: 'INVALID_NUMBER',
      exclusionReason: describeExclusion('INVALID_NUMBER', c.sourceType),
    })
  }

  // ── 7. The eligibility decision, one MERGED IDENTITY at a time. ───────
  for (const [normalizedNumber, group] of groups) {
    // Highest-priority contributor wins for identity/attribution.
    const ordered = [...group].sort((a, b) => sourcePriority(a.sourceType) - sourcePriority(b.sourceType))
    const winner = ordered[0]

    // OPT-OUT IS OR-MERGED ACROSS EVERY CONTRIBUTOR, never just the
    // winner's. If the same number appears as an opted-out Lead and as a
    // freshly-typed manual entry, the opt-out survives — a staff member
    // cannot launder an opt-out by retyping the number by hand. This mirrors
    // V1's OR-merge across duplicate Lead rows.
    const marketingOptOut = group.some(c => c.marketingOptOut === true)

    // Template fields merge field-by-field, first non-empty in priority
    // order. Affects only what a template renders — never eligibility.
    const fields: TemplateFields = {}
    for (const c of ordered) {
      for (const key of ['name', 'destination', 'service', 'travelDate'] as LeadTemplateField[]) {
        const v = c.fields[key]
        if (!fields[key] && typeof v === 'string' && v.trim()) fields[key] = v
      }
    }

    const provenance = normalizeProvenance(
      ordered.map(c => ({ type: c.sourceType, id: c.sourceId, label: c.label })),
    )
    const leadId = ordered.find(c => c.sourceType === 'LEAD')?.sourceId ?? null
    const visaApplicationId = ordered.find(c => c.sourceType === 'VISA_APPLICATION')?.sourceId ?? null
    const displayName = ordered.find(c => c.displayName)?.displayName ?? null

    const base = {
      leadId,
      visaApplicationId,
      sourceType: winner.sourceType,
      sourceProvenance: provenance,
      displayName,
      normalizedNumber,
    }

    const decision = decideEligibility({ marketingOptOut, normalizedNumber, consent: consentByNumber.get(normalizedNumber) ?? null })

    if (!decision.eligible) {
      if (decision.reason === 'OPT_OUT') breakdown.optedOut += 1
      else if (decision.reason === 'NO_CONSENT') breakdown.missingConsent += 1
      else breakdown.invalidNumber += 1

      recipients.push({
        ...base,
        waId: null,
        templateParamsSnapshot: [],
        status: SKIP_REASON_TO_STATUS[decision.reason],
        skipReason: decision.reason,
        exclusionReason: describeExclusion(decision.reason, winner.sourceType),
      })
      continue
    }

    // ── 8. Freeze the template parameters for this identity. ────────────
    let paramValues: string[] = []
    if (input.template) {
      const resolved = resolveTemplateParams(input.template.params, fields)
      if (resolved.missing.length > 0) {
        breakdown.templateUnresolvable += 1
        recipients.push({
          ...base,
          waId: null,
          templateParamsSnapshot: [],
          status: 'FAILED',
          skipReason: null,
          exclusionReason:
            `Template parameter ${resolved.missing.map(n => `{{${n}}}`).join(', ')} could not be filled from this ` +
            `recipient's ${winner.sourceType === 'MANUAL' ? 'manual entry' : 'record'} and has no fallback. ` +
            'Meta rejects an empty parameter, so this message is not sent rather than sent half-rendered.',
        })
        continue
      }
      paramValues = resolved.values
    }

    breakdown.eligible += 1
    breakdown.sendableBySource[winner.sourceType] += 1
    recipients.push({
      ...base,
      // Meta's wa_id is the number with no '+'.
      waId: normalizedNumber.replace(/^\+/, ''),
      templateParamsSnapshot: paramValues,
      status: 'QUEUED',
      skipReason: null,
      exclusionReason: null,
    })
  }

  breakdown.finalSendCount = breakdown.eligible
  breakdown.exclusions = buildExclusionBuckets(breakdown, manual)

  return {
    breakdown,
    recipients,
    sample: recipients.slice(0, 15).map(r => ({
      maskedNumber: maskNumber(r.normalizedNumber),
      status: r.status,
      sourceType: r.sourceType,
      sources: r.sourceProvenance.map(p => p.type),
      displayName: r.displayName,
      reason: r.exclusionReason,
    })),
    manual,
  }
}

/** The per-recipient sentence stored alongside every excluded row. */
export function describeExclusion(reason: SkipReason, sourceType: RecipientSourceType): string {
  const where =
    sourceType === 'MANUAL'
      ? 'this manually entered number'
      : sourceType === 'VISA_APPLICATION'
        ? "this visa applicant's number"
        : "this lead's number"
  switch (reason) {
    case 'OPT_OUT':
      return `Excluded: ${where} is opted out of marketing. An opt-out is a hard override and is checked before anything else — no consent record, however recent, re-enrols it.`
    case 'NO_CONSENT':
      return `Excluded: there is no recorded affirmative WhatsApp marketing consent for ${where}. Not having opted out is not the same as having opted in.`
    case 'INVALID_NUMBER':
      return `Excluded: ${where} is missing or is not a valid international (E.164) WhatsApp number.`
  }
}

/**
 * The same explained buckets for a V1 (single-source, filter-only)
 * breakdown, so the redesigned preview screen reads identically whichever
 * resolver produced the numbers. V1's resolver itself is untouched.
 */
export function exclusionsFromV1Breakdown(b: {
  optedOut: number
  missingConsent: number
  invalidNumber: number
  duplicatesRemoved: number
  countryFiltered: number
  templateUnresolvable: number
}): ExclusionBucket[] {
  return buildExclusionBuckets(
    { ...b, manualRejected: 0 } as MultiSourceBreakdown,
    { valid: [], invalid: [], duplicates: [], totalEntries: 0 },
  )
}

/** Turn the counted buckets into explained ones, for the preview screen. */
export function buildExclusionBuckets(
  b: MultiSourceBreakdown,
  manual: ManualNumberParseResult,
): ExclusionBucket[] {
  const out: ExclusionBucket[] = []
  if (b.optedOut > 0) {
    out.push({
      reason: 'Opted out',
      count: b.optedOut,
      description:
        'These recipients asked to stop receiving marketing, or their consent record says OPTED_OUT. This is a hard override checked before consent — nothing can re-enrol them here.',
    })
  }
  if (b.missingConsent > 0) {
    out.push({
      reason: 'No recorded consent',
      count: b.missingConsent,
      description:
        'No SUBSCRIBED row exists in the WhatsApp consent table for these numbers. Not having opted out is not consent, so they are excluded. Nothing in the product writes consent yet, which is why this figure is usually the whole audience.',
    })
  }
  if (b.invalidNumber > 0) {
    out.push({
      reason: 'Invalid or missing number',
      count: b.invalidNumber,
      description:
        'No usable international (E.164) WhatsApp number on the record. Local formats starting with 0 cannot be converted without a country, and are not guessed.',
    })
  }
  if (b.duplicatesRemoved > 0) {
    out.push({
      reason: 'Duplicates collapsed',
      count: b.duplicatesRemoved,
      description:
        'The same phone number was contributed more than once — by several leads, by a lead and a visa application, or by a manual entry that matched an existing record. Each number receives exactly one message; the contributing sources are kept on the single recipient for audit.',
    })
  }
  if (b.countryFiltered > 0) {
    out.push({
      reason: 'Outside the chosen country',
      count: b.countryFiltered,
      description:
        'Dropped by the country filter. There is no stored country field on a lead, so country is derived from the dialling prefix of the number. Individually ticked recipients are never dropped this way.',
    })
  }
  if (b.templateUnresolvable > 0) {
    out.push({
      reason: 'Template parameter could not be filled',
      count: b.templateUnresolvable,
      description:
        'A template placeholder had no value on this record and no fallback. Meta rejects an empty parameter, so the message is reported as failed rather than sent half-rendered.',
    })
  }
  if (manual.invalid.length > 0) {
    out.push({
      reason: 'Manual entries rejected',
      count: manual.invalid.length,
      description:
        'Typed or pasted entries the server could not read as an international WhatsApp number. They were never added to the audience. Each one is listed with its own reason in the Add Numbers tab.',
    })
  }
  return out
}
