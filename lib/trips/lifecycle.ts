// Provider-independent Trip lifecycle helpers.
// All payment providers (Stripe, Flutterwave, Paystack, Bank Transfer, Manual)
// call these shared helpers. The Trip status is NEVER set by a provider-specific
// webhook directly — only through this module.
//
// Lifecycle:
//   DRAFT → CHECKOUT_STARTED → PAID → CONFIRMING → CONFIRMED
//   CONFIRMING → PARTIALLY_CONFIRMED (some items failed)
//
// CONFIRMED means all required supplier items are confirmed — NOT just payment.
// Payment success = PAID. Supplier confirmation = CONFIRMED.

import prisma from '@/lib/db'

// ── Find trip by session or user ──────────────────────────────────────────────

async function findActiveTripId(opts: {
  tripId?:   string | null
  sessionId?: string | null
  userId?:   string | null
}): Promise<string | null> {
  if (opts.tripId) return opts.tripId

  if (opts.sessionId) {
    const t = await prisma.trip.findFirst({
      where:   { sessionId: opts.sessionId, status: { in: ['DRAFT', 'PLANNING', 'CHECKOUT_STARTED'] } },
      select:  { id: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (t) return t.id
  }

  if (opts.userId) {
    const t = await prisma.trip.findFirst({
      where:   { userId: opts.userId, status: { in: ['DRAFT', 'PLANNING', 'CHECKOUT_STARTED'] } },
      select:  { id: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (t) return t.id
  }

  return null
}

// ── CHECKOUT_STARTED ──────────────────────────────────────────────────────────
// Set when the user submits the checkout form (not just when they visit /cart).
// Called from /api/checkout/cart before creating the payment provider session.

export async function setTripCheckoutStarted(opts: {
  tripId?:   string | null
  sessionId?: string | null
  userId?:   string | null
}): Promise<void> {
  try {
    const id = await findActiveTripId(opts)
    if (!id) return
    await prisma.trip.updateMany({
      where: { id, status: { in: ['DRAFT', 'PLANNING'] } },
      data:  { status: 'CHECKOUT_STARTED' },
    })
  } catch (err) {
    console.warn('[TripLifecycle] setTripCheckoutStarted failed (non-fatal):', (err as Error).message)
  }
}

// ── PAID ──────────────────────────────────────────────────────────────────────
// Set when the payment provider authoritatively confirms payment received.
// Called from webhooks — NOT from the browser success redirect.
// Payment success ≠ supplier confirmation; do not set CONFIRMED here.

export async function setTripPaid(opts: {
  tripId?:   string | null
  sessionId?: string | null
  userId?:   string | null
}): Promise<void> {
  try {
    const id = await findActiveTripId({
      tripId:    opts.tripId,
      sessionId: opts.sessionId,
      userId:    opts.userId,
    }) ?? (opts.tripId ?? null)
    if (!id) return
    await prisma.trip.updateMany({
      where: { id, status: { in: ['DRAFT', 'PLANNING', 'CHECKOUT_STARTED'] } },
      data:  { status: 'PAID' },
    })
  } catch (err) {
    console.warn('[TripLifecycle] setTripPaid failed (non-fatal):', (err as Error).message)
  }
}

// ── CONFIRMING ────────────────────────────────────────────────────────────────
// Set when supplier fulfillment begins for external products.
// Called from the authoritative booking path (e.g. bookCartActivities).

export async function setTripConfirming(tripId: string): Promise<void> {
  try {
    await prisma.trip.updateMany({
      where: { id: tripId, status: 'PAID' },
      data:  { status: 'CONFIRMING' },
    })
  } catch (err) {
    console.warn('[TripLifecycle] setTripConfirming failed (non-fatal):', (err as Error).message)
  }
}

// ── deriveTripStatus ──────────────────────────────────────────────────────────
// Computes the correct aggregate trip status from item-level outcomes.
//
// As of Release 2D.1, TripItem.bookingRef is set by bookCartActivities() once
// payment is received, and TripItem.confirmed is set to true when the supplier
// authoritatively confirms the booking. Only PURCHASED items (bookingRef set OR
// confirmed=true) count toward the derived status — wishlist items are excluded.
//
// Previously used TripItem.confirmed as a planning proxy; now it is set only
// by the authoritative booking path (bookCartActivities → step 11 CONFIRMED).
//
// Only apply to trips in CONFIRMING or PARTIALLY_CONFIRMED state.
// Inputs: all TripItems for the trip that require supplier confirmation
//         (ACTIVITY, HOTEL, FLIGHT, TOUR, TRANSFER).

const CONFIRMABLE_TYPES = new Set(['ACTIVITY', 'HOTEL', 'FLIGHT', 'TOUR', 'TRANSFER'])

export async function deriveTripStatus(
  tripId: string
): Promise<'CONFIRMED' | 'PARTIALLY_CONFIRMED' | 'CONFIRMING' | null> {
  try {
    const items = await prisma.tripItem.findMany({
      where:  { tripId },
      select: { type: true, confirmed: true, bookingRef: true },
    })

    const confirmable = items.filter(i => CONFIRMABLE_TYPES.has(i.type.toUpperCase()))
    if (confirmable.length === 0) return null

    // Only purchased items count — wishlist items (no bookingRef, not confirmed) are excluded.
    const purchased = confirmable.filter(i => i.bookingRef !== null || i.confirmed)
    if (purchased.length === 0) return null

    const allConfirmed  = purchased.every(i => i.confirmed)
    const someConfirmed = purchased.some(i => i.confirmed)

    if (allConfirmed)  return 'CONFIRMED'
    if (someConfirmed) return 'PARTIALLY_CONFIRMED'
    return 'CONFIRMING'
  } catch (err) {
    console.warn('[TripLifecycle] deriveTripStatus failed:', (err as Error).message)
    return null
  }
}

// ── applyDerivedTripStatus ────────────────────────────────────────────────────
// Applies deriveTripStatus result to the trip record.
// Call after each authoritative supplier confirmation/rejection event.

export async function applyDerivedTripStatus(tripId: string): Promise<void> {
  try {
    const derived = await deriveTripStatus(tripId)
    if (!derived) return
    await prisma.trip.updateMany({
      where: { id: tripId, status: { in: ['CONFIRMING', 'PARTIALLY_CONFIRMED'] } },
      data:  { status: derived },
    })
  } catch (err) {
    console.warn('[TripLifecycle] applyDerivedTripStatus failed (non-fatal):', (err as Error).message)
  }
}
