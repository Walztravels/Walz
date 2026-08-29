/**
 * lib/v2/revision.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Pure utilities for the revision workflow. No I/O. Fully unit-testable.
 *
 * Revision status lifecycle:
 *   approved | revision_accepted
 *     → revision_draft   (advisor creates revision)
 *     → revision_sent    (advisor sends revised proposal to client)
 *     → revision_accepted (client accepts revision)
 *     → revision_draft   (revision abandoned → back to previous accepted)
 */

/** Itinerary statuses where a revision may be initiated */
export const ACCEPTED_STATUSES = ['approved', 'revision_accepted'] as const
export type AcceptedStatus = typeof ACCEPTED_STATUSES[number]

/** Statuses that represent an active revision in progress */
export const REVISION_IN_PROGRESS_STATUSES = ['revision_draft', 'revision_sent'] as const

/** All statuses that are part of the revision lifecycle */
export const ALL_REVISION_STATUSES = [
  'revision_draft', 'revision_sent', 'revision_accepted',
] as const

export function isAccepted(status: string): status is AcceptedStatus {
  return (ACCEPTED_STATUSES as readonly string[]).includes(status)
}

export function isRevisionInProgress(status: string): boolean {
  return (REVISION_IN_PROGRESS_STATUSES as readonly string[]).includes(status)
}

// ─── Content snapshot ─────────────────────────────────────────────────────────

export interface ContentSnapshot {
  flights:    unknown[]
  hotels:     unknown[]
  days:       unknown[]
  inclusions: unknown[]
  exclusions: unknown[]
  totalPrice: number | null
}

/**
 * Captures the mutable itinerary content fields into an immutable snapshot.
 * Written to itinerary_acceptance_history.content_snapshot at revision creation
 * so that diffs can compare "what the client accepted" vs "what's being revised".
 */
export function buildContentSnapshot(itin: {
  flights:    string
  hotels:     string
  days:       string
  inclusions: string
  exclusions: string
  totalPrice: number | null
}): ContentSnapshot {
  const safeParseArray = (json: string): unknown[] => {
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  return {
    flights:    safeParseArray(itin.flights),
    hotels:     safeParseArray(itin.hotels),
    days:       safeParseArray(itin.days),
    inclusions: safeParseArray(itin.inclusions),
    exclusions: safeParseArray(itin.exclusions),
    totalPrice: itin.totalPrice,
  }
}

// ─── Payment reconciliation ───────────────────────────────────────────────────

export interface PaymentSummaryRow {
  amount:   number | string
  currency: string
  status:   string
}

/**
 * Returns the sum of all PAID payments in the itinerary's payment currency.
 * Ignores PENDING, FAILED, and REFUNDED payments.
 */
export function computePaymentsReceived(
  payments: PaymentSummaryRow[],
  targetCurrency: string,
): number {
  return payments
    .filter(p => p.status === 'PAID' && p.currency === targetCurrency)
    .reduce((sum, p) => sum + Number(p.amount), 0)
}

// ─── Revision diff ────────────────────────────────────────────────────────────

export interface FlightChange {
  type: 'added' | 'removed' | 'changed'
  description: string
}

export interface HotelChange {
  type: 'added' | 'removed' | 'changed'
  description: string
}

export interface RevisionDiff {
  revisionNumber:              number
  originalAcceptedTotal:       number | null
  originalCurrency:            string
  revisedTotal:                number | null
  priceDiff:                   number | null
  paymentsReceived:            number
  outstanding:                 number | null
  isPriceCredit:               boolean
  flightChanges:               FlightChange[]
  hotelChanges:                HotelChange[]
  hasConfirmedFulfilmentItems: boolean
  confirmedFulfilmentItems:    Array<{ id: string; type: string; description: string | null; status: string }>
}

type FlightRow = { from?: string; to?: string; airline?: string; date?: string; flightNumber?: string }
type HotelRow  = { name?: string; location?: string; checkIn?: string; checkOut?: string; nights?: number }

function flightKey(f: FlightRow): string {
  return `${f.from ?? ''}→${f.to ?? ''}:${f.date ?? ''}:${f.airline ?? ''}:${f.flightNumber ?? ''}`
}
function hotelKey(h: HotelRow): string {
  return `${h.name ?? ''}:${h.location ?? ''}:${h.checkIn ?? ''}:${h.checkOut ?? ''}`
}

/**
 * Compares the original accepted content snapshot against the current mutable
 * itinerary state to produce a human-readable diff.
 */
export function buildRevisionDiff(opts: {
  revisionNumber:      number
  originalSnapshot:    ContentSnapshot
  currentFlights:      unknown[]
  currentHotels:       unknown[]
  currentTotalPrice:   number | null
  currency:            string
  paymentsReceived:    number
  confirmedFulfilmentItems: Array<{ id: string; type: string; description: string | null; status: string }>
}): RevisionDiff {
  const {
    revisionNumber, originalSnapshot, currentFlights, currentHotels,
    currentTotalPrice, currency, paymentsReceived, confirmedFulfilmentItems,
  } = opts

  // ── Flight diff ──────────────────────────────────────────────────────────────
  const origFlights = (originalSnapshot.flights ?? []) as FlightRow[]
  const curFlights  = currentFlights as FlightRow[]

  const origFlightKeys = new Set(origFlights.map(flightKey))
  const curFlightKeys  = new Set(curFlights.map(flightKey))

  const flightChanges: FlightChange[] = []
  for (const f of origFlights) {
    if (!curFlightKeys.has(flightKey(f))) {
      flightChanges.push({ type: 'removed', description: `${f.from ?? ''} → ${f.to ?? ''} (${f.date ?? ''})` })
    }
  }
  for (const f of curFlights) {
    if (!origFlightKeys.has(flightKey(f))) {
      flightChanges.push({ type: 'added', description: `${f.from ?? ''} → ${f.to ?? ''} (${f.date ?? ''})` })
    }
  }

  // ── Hotel diff ───────────────────────────────────────────────────────────────
  const origHotels = (originalSnapshot.hotels ?? []) as HotelRow[]
  const curHotels  = currentHotels as HotelRow[]

  const origHotelKeys = new Set(origHotels.map(hotelKey))
  const curHotelKeys  = new Set(curHotels.map(hotelKey))

  const hotelChanges: HotelChange[] = []
  for (const h of origHotels) {
    if (!curHotelKeys.has(hotelKey(h))) {
      hotelChanges.push({ type: 'removed', description: `${h.name ?? ''} (${h.location ?? ''})` })
    }
  }
  for (const h of curHotels) {
    if (!origHotelKeys.has(hotelKey(h))) {
      hotelChanges.push({ type: 'added', description: `${h.name ?? ''} (${h.location ?? ''})` })
    }
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────
  const originalAcceptedTotal = originalSnapshot.totalPrice
  const revisedTotal          = currentTotalPrice
  const priceDiff = originalAcceptedTotal != null && revisedTotal != null
    ? revisedTotal - originalAcceptedTotal
    : null
  const outstanding = revisedTotal != null
    ? Math.max(0, revisedTotal - paymentsReceived)
    : null
  const isPriceCredit = priceDiff != null && priceDiff < 0

  return {
    revisionNumber,
    originalAcceptedTotal,
    originalCurrency:            currency,
    revisedTotal,
    priceDiff,
    paymentsReceived,
    outstanding,
    isPriceCredit,
    flightChanges,
    hotelChanges,
    hasConfirmedFulfilmentItems: confirmedFulfilmentItems.length > 0,
    confirmedFulfilmentItems,
  }
}
