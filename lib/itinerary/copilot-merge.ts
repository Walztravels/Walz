/**
 * Jade Copilot generate/regenerate: protect unified bookings.
 *
 * The Copilot route asks an LLM for the whole itinerary and writes the result
 * back as a FULL REPLACEMENT of the flights/hotels columns. The LLM cannot
 * represent a unified booking (journeys[], pricing, offer snapshot), so without
 * this merge a regenerate silently deleted or downgraded them.
 *
 * Rules (pure, no I/O):
 *  a) Every EXISTING unified flight / research-hotel row is kept EXACTLY as
 *     stored (same object contents, all optional fields), whatever the LLM
 *     emitted. The LLM's row with the same id is ignored; an omitted unified
 *     row is kept.
 *  b) Legacy rows: LLM output governs, but when a generated row carries the id
 *     of an existing legacy row it is shallow-merged `{...existing,...generated}`
 *     so fields the Copilot schema predates survive the round-trip.
 *  c) NOTHING is inferred from airline/route/date: legacy rows are never
 *     grouped, merged or split.
 *  d) Newly generated flight rows stay legacy per-leg rows. A generated row
 *     is dropped ONLY when it provably duplicates a preserved unified booking:
 *     same id, or the same supplier offer id (offer snapshot / duffelOrderId).
 *
 * KNOWN LIMIT (documented, tested): if the LLM ALSO emits per-leg rows for the
 * same trip without echoing an id or offer id, they are kept as legacy rows
 * (we do not infer that they are the same trip), so the trip's cost can be
 * counted twice by totals that sum row costs. Staff should delete those rows.
 * Recomputation of totalPrice is out of scope here.
 */
import { offerDedupeKey } from '@/lib/itinerary/unified-booking'

export type CopilotBookingKind = 'flight' | 'hotel' | 'other'
type Row = Record<string, unknown>

const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * ANY row tagged as a unified flight / research hotel is protected verbatim,
 * even when journeys[] / rate is missing or malformed (we must not "fix" or
 * drop what we do not understand).
 */
export function isProtectedBookingRow(row: unknown): boolean {
  return isObj(row) && (row.bookingKind === 'unified-flight' || row.bookingKind === 'research-hotel')
}

function isProtected(row: Row, kind: CopilotBookingKind): boolean {
  if (kind === 'flight') return row.bookingKind === 'unified-flight'
  if (kind === 'hotel') return row.bookingKind === 'research-hotel'
  return false
}

export function mergeCopilotBookings(
  existing: unknown[] | null | undefined,
  generated: unknown[] | null | undefined,
  kind: CopilotBookingKind,
): Row[] {
  const ex = (Array.isArray(existing) ? existing : []).filter(isObj)
  const gen = (Array.isArray(generated) ? generated : []).filter(isObj)

  const preserved = ex.filter((r) => isProtected(r, kind))
  const preservedIds = new Set(preserved.map((r) => String(r.id ?? '')).filter(Boolean))
  const preservedOfferKeys = new Set(preserved.map((r) => offerDedupeKey(r)).filter((k): k is string => !!k))
  const preservedOfferIds = new Set(
    preserved
      .map((r) => (r.offer as { providerOfferId?: string } | undefined)?.providerOfferId)
      .filter((k): k is string => !!k),
  )
  const legacyById = new Map<string, Row>()
  for (const r of ex) {
    if (isProtected(r, kind)) continue
    const id = r.id == null ? '' : String(r.id)
    if (id) legacyById.set(id, r)
  }

  const out: Row[] = [...preserved] // exact stored objects, untouched
  for (const g of gen) {
    const gid = g.id == null ? '' : String(g.id)
    if (gid && preservedIds.has(gid)) continue // LLM version of a unified row is ignored
    const key = offerDedupeKey(g)
    if (key && preservedOfferKeys.has(key)) continue
    const dOrder = typeof g.duffelOrderId === 'string' ? g.duffelOrderId : ''
    if (dOrder && preservedOfferIds.has(dOrder)) continue
    const prior = gid ? legacyById.get(gid) : undefined
    out.push(prior ? { ...prior, ...g } : g)
  }
  return out
}
