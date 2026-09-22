/**
 * WhatsApp Broadcast V1.1 — recipient SOURCE vocabulary and provenance.
 *
 * Pure. No Prisma, no env, no I/O.
 *
 * ── WHY PROVENANCE EXISTS ───────────────────────────────────────────────
 * V1 had exactly one audience source (the Prisma `Lead` table), so a
 * recipient row's `leadId` was its whole story. V1.1 adds two more
 * sources — `VisaApplication` rows and manually typed numbers — and the
 * same human can legitimately arrive through all three at once (a lead who
 * later filed a visa application, whose number a staff member also pasted
 * into the manual box).
 *
 * WhatsApp delivers to a PHONE NUMBER, so the dispatch identity is still
 * the normalized number and there is still exactly ONE recipient row per
 * number per broadcast (enforced by UNIQUE(broadcast_id, normalized_number)
 * since V1). Provenance is what lets that single row still answer "where
 * did this person come from?" for staff, without minting a second send
 * target.
 *
 * ── WHY A JSON COLUMN AND NOT A SECOND TABLE ────────────────────────────
 * The provenance list is a handful of entries, written once at snapshot
 * time and never updated, never joined on, never aggregated in SQL. This
 * repo already stores exactly this kind of small, write-once structured
 * metadata as JSON on the broadcast tables (`templateParamsSnapshot`,
 * `audienceSnapshot`, `targetFilter`). A join table would add a migration,
 * an index, an RLS policy and a cascade rule to store data nothing queries
 * relationally. The single-valued `sourceType` column is separate and IS a
 * plain column, because that one IS filtered on and shown in lists.
 */

/**
 * Every source type the recipient table's CHECK constraint accepts.
 *
 * HONEST NOTE ON 'CLIENT'. The admin UI's first tab is "Clients & Leads",
 * but this codebase has no separate broadcastable client contact table:
 * the Prisma `Lead` table IS the client/lead contact store (ClientAccount
 * is a portal-login record and carries no independent marketing contact
 * identity). Nothing in this release emits 'CLIENT' — see
 * EMITTED_SOURCE_TYPES below. It is present in the vocabulary and the SQL
 * CHECK only so that a future, genuinely distinct client store does not
 * need a constraint migration. Do not read its presence as a claim that a
 * client source exists today.
 */
export const RECIPIENT_SOURCE_TYPES = ['CLIENT', 'LEAD', 'VISA_APPLICATION', 'MANUAL'] as const
export type RecipientSourceType = (typeof RECIPIENT_SOURCE_TYPES)[number]

/** The source types any resolver in this release actually produces. */
export const EMITTED_SOURCE_TYPES: readonly RecipientSourceType[] = ['LEAD', 'VISA_APPLICATION', 'MANUAL']

export function isRecipientSourceType(v: unknown): v is RecipientSourceType {
  return typeof v === 'string' && (RECIPIENT_SOURCE_TYPES as readonly string[]).includes(v)
}

/**
 * MERGE PRIORITY when one number is contributed by several sources.
 *
 * Deliberately fixed and data-driven rather than "most recently added
 * wins": a Lead row carries the richest template-fillable fields
 * (destination, service, travelDate); a VisaApplication carries a real
 * name and a destination; a manual entry carries at best a typed display
 * name. Merging in this order means the best available value fills each
 * template parameter, deterministically, whatever order staff happened to
 * click in.
 *
 * This ordering affects ONLY which display/template values are used. It
 * has no effect whatsoever on eligibility: marketingOptOut is OR-merged
 * across EVERY contributor (see audience-multi.ts), so a lower-priority
 * contributor's opt-out can never be outranked away.
 */
export const SOURCE_MERGE_PRIORITY: readonly RecipientSourceType[] = [
  'LEAD',
  'VISA_APPLICATION',
  'MANUAL',
  'CLIENT',
]

export function sourcePriority(t: RecipientSourceType): number {
  const i = SOURCE_MERGE_PRIORITY.indexOf(t)
  // An unknown type sorts last rather than first — fail closed on ordering.
  return i === -1 ? SOURCE_MERGE_PRIORITY.length : i
}

/**
 * One contributing source for a single dispatch identity, as frozen into
 * the recipient row's `sourceProvenance` JSON at snapshot time.
 *
 * `label` is a short human string for staff ("Ada Obi", "WLZ-2026-0041").
 * It is display metadata, never a lookup key.
 */
export interface RecipientProvenanceEntry {
  type: RecipientSourceType
  /** Lead.id / VisaApplication.id — null for a manual entry, which has no record. */
  id: string | null
  label: string | null
}

/** Stable ordering + de-duplication for a provenance list. */
export function normalizeProvenance(entries: RecipientProvenanceEntry[]): RecipientProvenanceEntry[] {
  const seen = new Set<string>()
  const out: RecipientProvenanceEntry[] = []
  for (const e of [...entries].sort((a, b) => sourcePriority(a.type) - sourcePriority(b.type))) {
    const key = `${e.type}:${e.id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Meta's real message-template category taxonomy.
 *
 * ── READ THIS BEFORE WIRING IT TO ANYTHING ──────────────────────────────
 * This value is RECORDED FOR BOOKKEEPING ONLY. It is stored on the
 * broadcast so staff can note which category of approved template they
 * used, and so a future Meta-compliance report can be produced from real
 * data. It is deliberately NOT an input to eligibility:
 *
 *   - Nothing in this codebase can verify a self-declared category. Meta
 *     owns template approval, and the category on the approved template is
 *     whatever Meta assigned it — not whatever an admin typed here.
 *   - A relaxed consent path keyed on an unverifiable, admin-chosen field
 *     is a consent bypass wearing a compliance costume.
 *
 * Therefore `decideEligibility()` never receives this value, and the
 * resolver never branches on it. Every broadcast built through the
 * audience builder requires the full affirmative-consent check,
 * unconditionally, whatever category is recorded here. There is a test
 * (whatsapp-broadcast-v11-no-consent-bypass.test.ts) pinning that.
 */
export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export function parseTemplateCategory(v: unknown): TemplateCategory | null {
  if (typeof v !== 'string') return null
  const up = v.trim().toUpperCase()
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(up) ? (up as TemplateCategory) : null
}
