/**
 * WhatsApp Broadcast V1 — server-side audience resolution.
 *
 * Implements the UI's `targetFilter` for real against the Prisma `Lead`
 * table, and produces the preview breakdown the wizard shows and the
 * recipient rows the snapshot is made of. A browser-supplied
 * recipientCount is never trusted or stored — every number below is
 * computed here.
 *
 * ── WHICH LEAD TABLE ────────────────────────────────────────────────────
 * This codebase has TWO lead stores: the Prisma `"Lead"` table (camelCase,
 * no @@map) and a separate Supabase `leads` table used by the Inbox
 * webhooks (see the explicit note in
 * prisma/migrations/inbox_0s4a_lead_cleanup.sql: "This script touches ONLY
 * the Prisma "Lead" table. It does NOT touch the Supabase 'leads' table").
 * Broadcast audiences resolve from the PRISMA table because that is the
 * one carrying `marketingOptOut` — the opt-out signal we are required to
 * honour — and the one the consent table foreign-keys to. A lead that
 * exists only in the Supabase `leads` table is therefore not addressable
 * by a broadcast at all; that is a deliberate, conservative choice and is
 * called out in the release report.
 *
 * ── WHICH FILTER DIMENSIONS ARE REAL ────────────────────────────────────
 * Only dimensions with actually-queryable data are offered:
 *   service — Lead.service, a real indexed column.
 *   branch  — Lead.branch, a real indexed column.
 *   country — NOT a column on Lead. There is no stored country field of
 *             any kind. It is derived from the DIALLING PREFIX of the
 *             lead's normalized WhatsApp number, applied in-process after
 *             normalization, and the UI says so. Nothing is invented.
 */

import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { decideEligibility, SKIP_REASON_TO_STATUS, type ConsentStatus, type SkipReason } from './consent'
import {
  resolveTemplateParams,
  type LeadTemplateField,
  type TemplateDefinition,
} from './template'

// ── Filter vocabulary ───────────────────────────────────────────────────

/** Lead.service values that actually occur (see the Lead model comment). */
export const SERVICE_OPTIONS = [
  'Visa Processing',
  'Flight Booking',
  'Holiday Package',
  'Group Travel',
  'Corporate Travel',
  'Hotel Only',
  'Other',
] as const

/**
 * Country is derived from the E.164 dialling prefix, NOT from a stored
 * column. Longest-prefix wins.
 */
export const COUNTRY_DIAL_PREFIXES: Record<string, string> = {
  NG: '+234',
  GH: '+233',
  KE: '+254',
  ZA: '+27',
  GB: '+44',
  US: '+1',
}

export interface TargetFilter {
  country?: string
  service?: string
  branch?: string
}

/** Narrow an untrusted JSON blob to the filter dimensions we support. */
export function parseTargetFilter(raw: unknown): TargetFilter {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: TargetFilter = {}
  if (typeof r.country === 'string' && r.country.trim()) out.country = r.country.trim().toUpperCase()
  if (typeof r.service === 'string' && r.service.trim()) out.service = r.service.trim()
  if (typeof r.branch === 'string' && r.branch.trim()) out.branch = r.branch.trim()
  return out
}

/** True when a normalized number belongs to the requested country. */
export function matchesCountry(normalizedNumber: string | null, country: string | undefined): boolean {
  if (!country) return true
  const prefix = COUNTRY_DIAL_PREFIXES[country.toUpperCase()]
  // An unknown country code matches nothing — fail closed rather than
  // silently broadcasting to everyone.
  if (!prefix || !normalizedNumber) return false
  return normalizedNumber.startsWith(prefix)
}

// ── Preview breakdown ───────────────────────────────────────────────────

export interface AudienceBreakdown {
  /** Leads returned by the DB filter (before any number/consent work). */
  totalMatched: number
  /** Distinct people with affirmative consent and a usable number. */
  eligible: number
  /** Excluded by Lead.marketingOptOut or a consent-side OPTED_OUT. */
  optedOut: number
  /** No WhatsAppConsent row, or a row that is not SUBSCRIBED. */
  missingConsent: number
  /** No WhatsApp number, or one that is not a usable E.164 number. */
  invalidNumber: number
  /** Extra Lead rows collapsed because they share one phone number. */
  duplicatesRemoved: number
  /** Matched leads dropped because their number is not in the chosen country. */
  countryFiltered: number
  /** Recipients whose template parameters could not be resolved. */
  templateUnresolvable: number
  /** What will actually be dispatched. Equals `eligible`. */
  finalSendCount: number
}

/** One resolved audience member, ready to be written as a recipient row. */
export interface ResolvedRecipient {
  leadId: string
  normalizedNumber: string | null
  waId: string | null
  templateParamsSnapshot: string[]
  status: string
  skipReason: SkipReason | null
}

export interface AudienceResolution {
  breakdown: AudienceBreakdown
  recipients: ResolvedRecipient[]
  /** A tiny, non-identifying sample for the preview screen. */
  sample: Array<{ maskedNumber: string; status: string }>
}

/** Cap on leads examined for one broadcast — a guard, not a business rule. */
export const MAX_AUDIENCE_SIZE = 5000

/** Show the country prefix + last 2 digits only; never a full number. */
export function maskNumber(n: string | null): string {
  if (!n) return '(no number)'
  if (n.length <= 6) return '••••'
  return `${n.slice(0, 4)}••••${n.slice(-2)}`
}

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

/**
 * Resolve an audience. `template` is optional: the preview screen can run
 * before a template is chosen, in which case parameter resolution (and the
 * templateUnresolvable bucket) is skipped.
 *
 * The returned `recipients` array is exactly what gets written at approval
 * time — preview and snapshot run the SAME function, so what an approver
 * sees is what gets frozen.
 */
export async function resolveAudience(input: {
  filter: TargetFilter
  template?: TemplateDefinition | null
}): Promise<AudienceResolution> {
  const filter = input.filter

  // ── 1. The real database filter. Only indexed, populated columns. ─────
  const where: Record<string, unknown> = {}
  if (filter.service) where.service = filter.service
  if (filter.branch) where.branch = filter.branch

  const leads = (await prisma.lead.findMany({
    where,
    select: {
      id: true,
      name: true,
      whatsapp: true,
      service: true,
      branch: true,
      destination: true,
      travelDate: true,
      marketingOptOut: true,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_AUDIENCE_SIZE,
  })) as LeadRow[]

  const breakdown: AudienceBreakdown = {
    totalMatched: leads.length,
    eligible: 0,
    optedOut: 0,
    missingConsent: 0,
    invalidNumber: 0,
    duplicatesRemoved: 0,
    countryFiltered: 0,
    templateUnresolvable: 0,
    finalSendCount: 0,
  }

  // ── 2. Normalize numbers, apply the derived country filter. ───────────
  interface Candidate {
    lead: LeadRow
    normalizedNumber: string | null
  }
  const candidates: Candidate[] = []
  for (const lead of leads) {
    const normalizedNumber = normalizePhoneE164(lead.whatsapp)
    if (filter.country && !matchesCountry(normalizedNumber, filter.country)) {
      breakdown.countryFiltered += 1
      continue
    }
    candidates.push({ lead, normalizedNumber })
  }

  // ── 3a. OR marketingOptOut across EVERY candidate sharing a number, not
  //       just the one row that wins dedup below. Duplicate Lead rows for
  //       the same person can disagree on consent (e.g. an older row was
  //       opted out, a newer row from a different capture source was
  //       not) — the opt-out must never be lost just because a more
  //       recent duplicate happens not to carry it. This mirrors the
  //       OR-merge this repo's own one-time
  //       prisma/migrations/inbox_0s4a_lead_cleanup.sql migration used for
  //       the identical duplicate-merge problem:
  //       `"marketingOptOut" = (c."marketingOptOut" OR d."marketingOptOut")`.
  const optOutByNumber = new Map<string, boolean>()
  for (const c of candidates) {
    if (!c.normalizedNumber) continue
    optOutByNumber.set(c.normalizedNumber, (optOutByNumber.get(c.normalizedNumber) ?? false) || c.lead.marketingOptOut)
  }

  // ── 3. Collapse duplicate Lead rows that share ONE phone number. ──────
  // WhatsApp delivers to a number, and Lead is unique only on
  // (source, sourceId) — the same human legitimately appears as several
  // rows. The first (most recent) row wins for non-consent fields (name,
  // service, etc.); the rest are counted, not dispatched, and never get a
  // recipient row (they would collide with the
  // UNIQUE(broadcast_id, normalized_number) index anyway). Consent itself
  // uses the OR-merged flag above, not just the winning row's own.
  const seenNumbers = new Set<string>()
  const deduped: Candidate[] = []
  for (const c of candidates) {
    if (c.normalizedNumber) {
      if (seenNumbers.has(c.normalizedNumber)) {
        breakdown.duplicatesRemoved += 1
        continue
      }
      seenNumbers.add(c.normalizedNumber)
    }
    deduped.push(c)
  }

  // ── 4. Load consent for every surviving number in ONE query. ──────────
  const numbers = Array.from(seenNumbers)
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

  // ── 5. The eligibility decision, one lead at a time. ──────────────────
  const recipients: ResolvedRecipient[] = []
  for (const c of deduped) {
    const decision = decideEligibility({
      // OR-merged across every duplicate sharing this number (see 3a
      // above) — never just this winning row's own flag.
      marketingOptOut: c.normalizedNumber
        ? optOutByNumber.get(c.normalizedNumber) ?? c.lead.marketingOptOut
        : c.lead.marketingOptOut,
      normalizedNumber: c.normalizedNumber,
      consent: c.normalizedNumber ? consentByNumber.get(c.normalizedNumber) ?? null : null,
    })

    if (!decision.eligible) {
      if (decision.reason === 'OPT_OUT') breakdown.optedOut += 1
      else if (decision.reason === 'NO_CONSENT') breakdown.missingConsent += 1
      else breakdown.invalidNumber += 1

      recipients.push({
        leadId: c.lead.id,
        normalizedNumber: c.normalizedNumber,
        waId: null,
        templateParamsSnapshot: [],
        status: SKIP_REASON_TO_STATUS[decision.reason],
        skipReason: decision.reason,
      })
      continue
    }

    // ── 6. Freeze the template parameters for this person. ──────────────
    let paramValues: string[] = []
    if (input.template) {
      const leadFields: Partial<Record<LeadTemplateField, string | null>> = {
        name: c.lead.name,
        destination: c.lead.destination,
        service: c.lead.service,
        travelDate: c.lead.travelDate,
      }
      const resolved = resolveTemplateParams(input.template.params, leadFields)
      if (resolved.missing.length > 0) {
        // A parameter Meta would reject. Never sent as a half-rendered
        // message and never downgraded to free text — recorded as a
        // failure of THIS recipient so the rest of the campaign proceeds.
        breakdown.templateUnresolvable += 1
        recipients.push({
          leadId: c.lead.id,
          normalizedNumber: c.normalizedNumber,
          waId: null,
          templateParamsSnapshot: [],
          status: 'FAILED',
          skipReason: null,
        })
        continue
      }
      paramValues = resolved.values
    }

    breakdown.eligible += 1
    recipients.push({
      leadId: c.lead.id,
      normalizedNumber: c.normalizedNumber,
      // Meta's wa_id is the number with no '+'.
      waId: (c.normalizedNumber as string).replace(/^\+/, ''),
      templateParamsSnapshot: paramValues,
      status: 'QUEUED',
      skipReason: null,
    })
  }

  breakdown.finalSendCount = breakdown.eligible

  return {
    breakdown,
    recipients,
    sample: recipients.slice(0, 10).map(r => ({ maskedNumber: maskNumber(r.normalizedNumber), status: r.status })),
  }
}
