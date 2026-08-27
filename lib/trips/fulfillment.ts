// Authoritative per-item fulfillment status for Trip items.
//
// Product-type resolution matrix (2D.1.1):
//   ACTIVITY  — ActivityBooking by walzReference (full supplier lifecycle)
//   ESIM      — EsimOrder by tripId (separate purchase flow, tripId only)
//   HOTEL     — payment-only: bookingRef = PAYMENT_RECEIVED, confirmed = CONFIRMED
//   FLIGHT    — payment-only (FlightBooking in Supabase, not queryable via Prisma)
//   TRANSFER  — payment-only
//   TOUR      — payment-only (falls back to confirmed flag)
//
// Wishlist items (bookingRef=null, confirmed=false) → NOT_PURCHASED.
// Manually admin-confirmed (confirmed=true, no bookingRef) → CONFIRMED.

import prisma from '@/lib/db'

export type FulfillmentStatus =
  | 'NOT_PURCHASED'
  | 'PAYMENT_RECEIVED'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED'
  | 'CANCELLED'

function mapActivityBookingStatus(status: string): FulfillmentStatus {
  switch (status) {
    case 'CONFIRMED':                    return 'CONFIRMED'
    case 'SUPPLIER_CONFIRMING':          return 'CONFIRMING'
    case 'SUPPLIER_BOOKING_FAILED':
    case 'PRICE_CHANGE_REQUIRES_ACTION': return 'FAILED'
    case 'RECONCILIATION_REQUIRED':      return 'RECONCILIATION_REQUIRED'
    case 'PAYMENT_RECEIVED':             return 'PAYMENT_RECEIVED'
    default:                             return 'PAYMENT_RECEIVED'
  }
}

function mapEsimOrderStatus(status: string): FulfillmentStatus {
  switch (status) {
    case 'active':    return 'CONFIRMED'
    case 'cancelled':
    case 'expired':   return 'CANCELLED'
    case 'failed':    return 'FAILED'
    case 'pending':   return 'PAYMENT_RECEIVED'
    default:          return 'PAYMENT_RECEIVED'
  }
}

// For products without a supplier booking record (HOTEL, FLIGHT, TRANSFER, TOUR):
// resolution is based on TripItem flags alone.
function resolvePaymentOnlyFulfillment(bookingRef: string | null, confirmed: boolean): FulfillmentStatus {
  if (confirmed) return 'CONFIRMED'
  if (bookingRef) return 'PAYMENT_RECEIVED'
  return 'NOT_PURCHASED'
}

const ACTIVITY_TYPES = new Set(['ACTIVITY'])
const ESIM_TYPES     = new Set(['ESIM'])

export async function getTripItemFulfillmentStatus(item: {
  bookingRef: string | null
  confirmed:  boolean
  type:       string
}, opts?: { tripId?: string }): Promise<FulfillmentStatus> {
  const typeUpper = item.type.toUpperCase()

  if (ESIM_TYPES.has(typeUpper) && opts?.tripId) {
    const esimOrder = await prisma.esimOrder.findFirst({
      where:  { tripId: opts.tripId },
      select: { status: true },
      orderBy: { purchasedAt: 'desc' },
    })
    if (esimOrder) return mapEsimOrderStatus(esimOrder.status)
    // No EsimOrder found — fall back to flags
    return resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed)
  }

  if (ACTIVITY_TYPES.has(typeUpper)) {
    if (!item.bookingRef && !item.confirmed) return 'NOT_PURCHASED'
    if (item.confirmed && !item.bookingRef) return 'CONFIRMED'
    if (item.bookingRef) {
      const booking = await prisma.activityBooking.findFirst({
        where:  { walzReference: item.bookingRef },
        select: { status: true },
      })
      if (booking) return mapActivityBookingStatus(booking.status)
    }
    return resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed)
  }

  // HOTEL, FLIGHT, TRANSFER, TOUR — payment-only
  return resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed)
}

// Batch fulfillment status for multiple TripItems.
// Executes at most 3 DB queries regardless of item count:
//   1. ActivityBooking batch (ACTIVITY items with bookingRef)
//   2. EsimOrder lookup (ESIM items, by tripId)
//   3. (no third query — non-activity/non-esim resolved from flags)
export async function getTripItemsFulfillmentStatuses(
  items: Array<{ id: string; bookingRef: string | null; confirmed: boolean; type: string }>,
  opts?: { tripId?: string }
): Promise<Map<string, FulfillmentStatus>> {
  const result = new Map<string, FulfillmentStatus>()

  // ── Batch 1: ActivityBooking lookup for ACTIVITY items ───────────────────
  const activityItems = items.filter(i => i.type.toUpperCase() === 'ACTIVITY' && i.bookingRef)
  const activityRefs  = activityItems.map(i => i.bookingRef as string)

  let bookingsByRef = new Map<string, string>()
  if (activityRefs.length > 0) {
    const bookings = await prisma.activityBooking.findMany({
      where:  { walzReference: { in: activityRefs } },
      select: { walzReference: true, status: true },
    })
    bookingsByRef = new Map(bookings.map(b => [b.walzReference ?? '', b.status]))
  }

  // ── Batch 2: EsimOrder lookup (if tripId provided and ESIM items present) ─
  let esimStatus: FulfillmentStatus | null = null
  const esimItems = items.filter(i => i.type.toUpperCase() === 'ESIM')
  if (esimItems.length > 0 && opts?.tripId) {
    const esimOrder = await prisma.esimOrder.findFirst({
      where:   { tripId: opts.tripId },
      select:  { status: true },
      orderBy: { purchasedAt: 'desc' },
    })
    if (esimOrder) esimStatus = mapEsimOrderStatus(esimOrder.status)
  }

  // ── Resolve each item ────────────────────────────────────────────────────
  for (const item of items) {
    const typeUpper = item.type.toUpperCase()

    if (typeUpper === 'ACTIVITY') {
      if (!item.bookingRef && !item.confirmed) {
        result.set(item.id, 'NOT_PURCHASED')
      } else if (item.confirmed && !item.bookingRef) {
        result.set(item.id, 'CONFIRMED')
      } else if (item.bookingRef) {
        const status = bookingsByRef.get(item.bookingRef)
        result.set(item.id, status
          ? mapActivityBookingStatus(status)
          : resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed)
        )
      } else {
        result.set(item.id, 'NOT_PURCHASED')
      }
      continue
    }

    if (typeUpper === 'ESIM') {
      result.set(item.id,
        esimStatus ?? resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed)
      )
      continue
    }

    // HOTEL, FLIGHT, TRANSFER, TOUR — payment-only resolution
    result.set(item.id, resolvePaymentOnlyFulfillment(item.bookingRef, item.confirmed))
  }

  return result
}

// ── Attach-rate helpers (2D.1.1) ──────────────────────────────────────────────
// Determines whether a TripItem counts as "acquired" for attach-rate purposes.
//
// ACTIVITY: must be confirmed=true (authoritative via ActivityBooking back-write).
//   confirmed=true is only set when ActivityBooking.status = CONFIRMED — it is
//   NOT set for FAILED/PRICE_CHANGE_REQUIRES_ACTION/RECONCILIATION_REQUIRED.
//   So confirmed=true is already cancellation-aware for activities.
//
// Other types (HOTEL, FLIGHT, TRANSFER, ESIM, TOUR):
//   bookingRef IS NOT NULL (payment received) OR confirmed=true (admin-confirmed).
//   No supplier gate exists in the current system for these product types.
//
// Note: For eSIM, EsimOrder.status='cancelled'/'failed' items may still have
//   TripItem.bookingRef set. Use esimStatus override when available.
export function isAcquiredForAttachRate(
  item: { type: string; confirmed: boolean; bookingRef: string | null },
  esimStatus?: FulfillmentStatus
): boolean {
  const typeUpper = item.type.toUpperCase()

  if (typeUpper === 'ACTIVITY') {
    // Only count authoritatively confirmed activities — excludes failed, reconciliation-required
    return item.confirmed === true
  }

  if (typeUpper === 'ESIM' && esimStatus !== undefined) {
    // Use EsimOrder authoritative status — exclude cancelled/failed
    return esimStatus === 'CONFIRMED' || esimStatus === 'PAYMENT_RECEIVED'
  }

  // HOTEL, FLIGHT, TRANSFER, TOUR: payment received = acquired
  return item.confirmed || item.bookingRef !== null
}
