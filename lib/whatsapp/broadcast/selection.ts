/**
 * WhatsApp Broadcast V1.1 — the untrusted audience SELECTION, narrowed.
 *
 * Pure. No Prisma, no env, no I/O.
 *
 * ── WHAT A SELECTION IS ─────────────────────────────────────────────────
 * A selection is a set of POINTERS and FILTERS, never a set of recipients.
 * It carries Lead ids, VisaApplication ids, explicitly-resolved filters and
 * raw manual number strings — and nothing else. There is deliberately no
 * place in this shape to put a name, a phone number belonging to a database
 * record, an eligibility verdict, a consent status or a recipient count.
 *
 * That is the V1.1 restatement of V1's discipline ("a browser-supplied
 * recipientCount is never trusted"): the browser tells the server WHO IT
 * PICKED, and the server goes and reads those records itself, every time,
 * at preview and again at snapshot. A tampered selection can only ever name
 * a different real record — it can never assert a number, a name or an
 * eligibility that the database does not itself say.
 *
 * ── "SELECT ALL" IS NEVER IMPLICIT ──────────────────────────────────────
 * `useLeadFilter` / `useVisaFilter` mean "everyone matching the filter
 * beside it, which the UI has already shown me a real count for". With the
 * flag false (or absent), the bulk source contributes NOTHING, even if a
 * filter object is present. There is no shape here that means "everyone",
 * and an empty filter with the flag on still passes through the resolver's
 * explicit MAX_AUDIENCE_SIZE cap.
 */

import { parseTargetFilter, type TargetFilter } from './audience'
import { parseManualEntriesPayload, type ManualNumberInput } from './manual-numbers'

/**
 * VisaApplication filter dimensions — every one of these is a REAL,
 * populated column on the model (audited against prisma/schema.prisma):
 *   destinationIso2  — the destination/visa country (2-letter ISO).
 *   visaType         — 'tourist' | 'business' | … (String, default 'tourist').
 *   status           — 'draft' | 'received' | 'documents_pending' |
 *                      'under_review' | 'ready_to_submit' |
 *                      'submitted_to_embassy' | 'decision_pending' |
 *                      'approved' | 'refused' | 'info_required'.
 *   assignedTo       — the legacy string staff assignment actually used by
 *                      the admin list UI (VISA_AGENTS in lib/visa-config).
 *   branch           — 'nigeria' | … (String, default 'nigeria').
 *   createdFrom/To   — application date range over createdAt.
 *
 * Dimensions NOT offered, because the schema cannot back them: there is no
 * "lead link" on VisaApplication (no leadId foreign key exists) and no
 * marketing segment column of any kind.
 */
export interface VisaTargetFilter {
  destinationIso2?: string
  visaType?: string
  status?: string
  assignedTo?: string
  branch?: string
  createdFrom?: string
  createdTo?: string
}

export interface AudienceSelection {
  /** V1's lead filter (service / branch / derived country prefix). */
  leadFilter?: TargetFilter
  /** "Select all leads matching leadFilter" — explicit, never implied. */
  useLeadFilter?: boolean
  /** Individually picked Lead ids. */
  leadIds?: string[]
  visaFilter?: VisaTargetFilter
  /** "Select all visa applications matching visaFilter" — explicit. */
  useVisaFilter?: boolean
  /** Individually picked VisaApplication ids. */
  visaApplicationIds?: string[]
  /** Raw manual entries, re-normalized server-side on every use. */
  manualEntries?: ManualNumberInput[]
}

/** Per-source cap on how many ids one request may name. */
export const MAX_SELECTED_IDS = 5000

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    // cuid / uuid shaped only. Anything else is not an id this app issues
    // and has no business reaching a `where: { id: { in: … } }`.
    if (!ID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_SELECTED_IDS) break
  }
  return out
}

function trimmed(v: unknown, max = 64): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return undefined
  return s.slice(0, max)
}

/** Narrow an untrusted JSON blob to the visa filter dimensions we support. */
export function parseVisaTargetFilter(raw: unknown): VisaTargetFilter {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: VisaTargetFilter = {}
  const dest = trimmed(r.destinationIso2, 2)
  if (dest) out.destinationIso2 = dest.toUpperCase()
  const visaType = trimmed(r.visaType)
  if (visaType) out.visaType = visaType
  const status = trimmed(r.status)
  if (status) out.status = status
  const assignedTo = trimmed(r.assignedTo)
  if (assignedTo) out.assignedTo = assignedTo
  const branch = trimmed(r.branch)
  if (branch) out.branch = branch
  // Dates are kept as strings here and only turned into Date objects by the
  // resolver, which discards anything unparseable rather than querying with
  // an Invalid Date.
  const from = trimmed(r.createdFrom, 40)
  if (from && !Number.isNaN(new Date(from).getTime())) out.createdFrom = from
  const to = trimmed(r.createdTo, 40)
  if (to && !Number.isNaN(new Date(to).getTime())) out.createdTo = to
  return out
}

/**
 * Narrow an untrusted selection blob. Unknown keys are dropped, not
 * forwarded — so a future "trust me, this one is eligible" field invented
 * by a tampered client cannot survive this function.
 */
export function parseAudienceSelection(raw: unknown): AudienceSelection {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: AudienceSelection = {}

  const leadFilter = parseTargetFilter(r.leadFilter)
  if (Object.keys(leadFilter).length > 0) out.leadFilter = leadFilter
  if (r.useLeadFilter === true) out.useLeadFilter = true

  const leadIds = parseIdList(r.leadIds)
  if (leadIds.length > 0) out.leadIds = leadIds

  const visaFilter = parseVisaTargetFilter(r.visaFilter)
  if (Object.keys(visaFilter).length > 0) out.visaFilter = visaFilter
  if (r.useVisaFilter === true) out.useVisaFilter = true

  const visaIds = parseIdList(r.visaApplicationIds)
  if (visaIds.length > 0) out.visaApplicationIds = visaIds

  const manual = parseManualEntriesPayload(r.manualEntries)
  if (manual.length > 0) out.manualEntries = manual

  return out
}

/**
 * True when a selection names at least one explicit multi-source input.
 *
 * The preview and schedule routes use this to decide whether to run the
 * V1.1 multi-source resolver or V1's untouched single-source
 * `resolveAudience()`. A V1-shaped broadcast (targetFilter only, no
 * selection) therefore keeps running through precisely the code that was
 * reviewed and deployed for V1 — this release adds a path, it does not
 * reroute the existing one.
 */
export function hasMultiSourceSelection(s: AudienceSelection): boolean {
  return Boolean(
    (s.leadIds && s.leadIds.length > 0) ||
      (s.visaApplicationIds && s.visaApplicationIds.length > 0) ||
      (s.manualEntries && s.manualEntries.length > 0) ||
      s.useVisaFilter ||
      s.useLeadFilter,
  )
}

/** True when a selection would resolve nobody at all. */
export function isEmptySelection(s: AudienceSelection): boolean {
  return !hasMultiSourceSelection(s)
}
