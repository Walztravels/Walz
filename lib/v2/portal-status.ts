// lib/v2/portal-status.ts
// =============================================================================
// Pure module — no framework dependencies. Derives the client-facing portal
// status from fulfilment items and payments. Fully unit-testable.
// =============================================================================

export type PortalStatus =
  | 'ACCEPTED'            // accepted, no fulfilment items, no payment recorded
  | 'PAYMENT_RECEIVED'    // payment recorded, no fulfilment items
  | 'BOOKING_IN_PROGRESS' // fulfilment items exist but not all confirmed/booked
  | 'TRIP_CONFIRMED'      // all active fulfilment items CONFIRMED or BOOKED
  | 'ACTION_REQUIRED'     // any fulfilment item has status FAILED

export interface FulfilmentSummary {
  id: string
  status: string  // FulfilmentStatus string value
}

export interface PaymentSummary {
  id: string
  status: string  // 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED'
}

/**
 * Pure function — no I/O. Derives the portal status from fulfilment items
 * and payments.
 *
 * Logic (exact, in this order):
 * 1. If any fulfilmentItem has status 'FAILED' → 'ACTION_REQUIRED'
 * 2. Let active = fulfilmentItems.filter(i => i.status !== 'CANCELLED')
 * 3. If active.length > 0 and all active have status 'CONFIRMED' or 'BOOKED' → 'TRIP_CONFIRMED'
 * 4. If active.length > 0 → 'BOOKING_IN_PROGRESS'
 * 5. If payments.some(p => p.status === 'PAID') → 'PAYMENT_RECEIVED'
 * 6. Default → 'ACCEPTED'
 */
export function derivePortalStatus(
  fulfilmentItems: FulfilmentSummary[],
  payments: PaymentSummary[],
): PortalStatus {
  // 1. Any FAILED item is an immediate blocker — overrides everything else
  if (fulfilmentItems.some(i => i.status === 'FAILED')) {
    return 'ACTION_REQUIRED'
  }

  // 2. Cancelled items are not blockers
  const active = fulfilmentItems.filter(i => i.status !== 'CANCELLED')

  // 3. All active items confirmed / booked
  if (
    active.length > 0 &&
    active.every(i => i.status === 'CONFIRMED' || i.status === 'BOOKED')
  ) {
    return 'TRIP_CONFIRMED'
  }

  // 4. Active items exist but not all confirmed
  if (active.length > 0) {
    return 'BOOKING_IN_PROGRESS'
  }

  // 5. No active fulfilment items, but a payment has been received
  if (payments.some(p => p.status === 'PAID')) {
    return 'PAYMENT_RECEIVED'
  }

  // 6. Default — accepted but nothing further recorded yet
  return 'ACCEPTED'
}
