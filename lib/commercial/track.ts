import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'

export type CommercialEventName =
  | 'flight_search'
  | 'hotel_search'
  | 'activity_search'
  | 'transfer_search'
  | 'product_view'
  | 'lead_created'
  | 'checkout_started'
  | 'payment_started'
  | 'payment_succeeded'
  | 'booking_confirmed'          // fires only when authoritative booking status = CONFIRMED
  | 'supplier_booking_failed'    // fires when supplier definitively rejects after payment
  | 'reconciliation_required'    // fires when supplier response is unknown (timeout/lost)
  | 'payment_failed'             // server-only — provider declined/failed the payment
  | 'refund_processed'           // server-only — refund confirmed by provider
  | 'jade_started'
  | 'jade_trip_intent'
  | 'proposal_viewed'
  | 'proposal_accepted'
  | 'trip_created'
  | 'trip_item_added'
  | 'trip_item_removed'
  | 'cross_sell_shown'
  | 'cross_sell_clicked'
  | 'cross_sell_added'
  | 'cross_sell_purchased'           // server-only — fires when a cross-sell item booking is CONFIRMED
  | 'post_booking_upsell_shown'      // browser-safe — success page cross-sell section rendered
  | 'post_booking_upsell_clicked'    // browser-safe — user clicked a post-booking upsell CTA
  | 'post_booking_upsell_added'      // server-only — upsell item added to a trip post-booking
  | 'post_booking_upsell_purchased'  // server-only — upsell item booking CONFIRMED after post-booking add
  // Release 4B — Jade live search events (server-side only)
  | 'jade_flight_search'
  | 'jade_hotel_search'
  | 'jade_activity_search'
  | 'jade_transfer_search'
  | 'jade_esim_search'
  | 'jade_search_result_added'
  | 'jade_trip_build_started'
  | 'jade_trip_build_completed'
  | 'jade_trip_build_failed'
  // Release 4C — Jade trip refinement, CRM sync, proposals
  | 'jade_trip_refined'
  | 'jade_trip_item_replaced'
  | 'jade_lead_created'
  | 'jade_lead_updated'
  | 'jade_lead_qualified'
  | 'jade_proposal_requested'
  | 'jade_proposal_created'

export interface TrackOptions {
  eventId?:     string   // client dedup key — reject duplicates from browser
  sessionId?:   string
  userId?:      string
  leadId?:      string
  bookingId?:   string
  productType?: string
  productId?:   string
  destination?: string
  currency?:    string
  amount?:      number
  metadata?:    Record<string, unknown>
}

function buildData(event: CommercialEventName, opts: TrackOptions) {
  return {
    id:          generateId(),
    event,
    eventId:     opts.eventId     ?? null,
    sessionId:   opts.sessionId   ?? null,
    userId:      opts.userId      ?? null,
    leadId:      opts.leadId      ?? null,
    bookingId:   opts.bookingId   ?? null,
    productType: opts.productType ?? null,
    productId:   opts.productId   ?? null,
    destination: opts.destination ?? null,
    currency:    opts.currency    ?? null,
    amount:      opts.amount      ?? null,
    metadata:    opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
  }
}

/**
 * Fire-and-forget — analytics events that tolerate occasional loss.
 * Correct for: flight_search, hotel_search, product_view, jade_started, etc.
 * Never await this; never use for financial events.
 */
export function trackCommercialEvent(
  event: CommercialEventName,
  opts: TrackOptions = {},
): void {
  prisma.commercialEvent.create({ data: buildData(event, opts) }).catch(err => {
    console.warn('[CommercialEvent] insert failed (non-fatal):', (err as Error).message)
  })
}

/**
 * Durable — awaitable. Use for financially-significant events:
 * payment_succeeded, booking_confirmed, supplier_booking_failed,
 * proposal_accepted, checkout_started.
 *
 * Callers MUST wrap in try/catch — a tracking failure must never
 * propagate to the business transaction.
 *
 * Example:
 *   try { await trackDurableEvent('payment_succeeded', opts) } catch {}
 */
export async function trackDurableEvent(
  event: CommercialEventName,
  opts: TrackOptions = {},
): Promise<void> {
  await prisma.commercialEvent.create({ data: buildData(event, opts) })
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'c'
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

// ─────────────────────────────────────────────────────────────────────────────
// Centralized booking lifecycle events
//
// These wrap trackDurableEvent with the correct event name for each outcome.
// Call these from the authoritative confirmation point for each product type,
// NOT from the Stripe webhook handler.
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingEventOpts {
  bookingId?:   string
  leadId?:      string
  sessionId?:   string
  productType?: string   // 'activity' | 'hotel' | 'flight' | 'transfer' | 'tour'
  supplier?:    string   // 'VIATOR' | 'HOTELBEDS' | 'DUFFEL' | 'WALZ'
  amount?:      number
  currency?:    string
  metadata?:    Record<string, unknown>
}

/**
 * Fire when the authoritative booking record transitions to CONFIRMED.
 * Must wrap in try/catch — never allowed to fail the business transaction.
 */
export async function recordBookingConfirmed(opts: BookingEventOpts): Promise<void> {
  await trackDurableEvent('booking_confirmed', {
    bookingId:   opts.bookingId,
    leadId:      opts.leadId,
    sessionId:   opts.sessionId,
    productType: opts.productType,
    amount:      opts.amount,
    currency:    opts.currency,
    metadata:    { supplier: opts.supplier, ...opts.metadata },
  })
}

/**
 * Fire when the supplier definitively rejects a booking after payment succeeded.
 * Must wrap in try/catch.
 */
export async function recordSupplierBookingFailed(opts: BookingEventOpts): Promise<void> {
  await trackDurableEvent('supplier_booking_failed', {
    bookingId:   opts.bookingId,
    leadId:      opts.leadId,
    sessionId:   opts.sessionId,
    productType: opts.productType,
    amount:      opts.amount,
    currency:    opts.currency,
    metadata:    { supplier: opts.supplier, ...opts.metadata },
  })
}

/**
 * Fire when the supplier response is unknown after payment (timeout / lost response).
 * Must wrap in try/catch.
 */
export async function recordReconciliationRequired(opts: BookingEventOpts): Promise<void> {
  await trackDurableEvent('reconciliation_required', {
    bookingId:   opts.bookingId,
    leadId:      opts.leadId,
    sessionId:   opts.sessionId,
    productType: opts.productType,
    amount:      opts.amount,
    currency:    opts.currency,
    metadata:    { supplier: opts.supplier, ...opts.metadata },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-booking purchase attribution
//
// cross_sell_purchased and post_booking_upsell_purchased are server-only events
// that fire when an item with commercial attribution reaches CONFIRMED status.
//
// Idempotency: keyed on `cross_sell_purchased:<tripItemId>` / `post_booking_upsell_purchased:<tripItemId>`
// so that webhook retries never produce duplicate revenue records.
//
// commercialSource values: 'cross_sell' | 'post_booking_upsell'
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseAttributionOpts {
  tripItemId:        string          // idempotency anchor
  bookingId?:        string
  sessionId?:        string
  productType?:      string
  recommendationType?: string        // 'HOTEL' | 'TRANSFER' | 'ACTIVITY' | 'ESIM' | 'FLIGHT'
  sourceProductType?:  string        // product type that triggered the recommendation
  amount?:           number
  currency?:         string
}

export async function recordCrossSellPurchased(opts: PurchaseAttributionOpts): Promise<void> {
  const idempotencyKey = `cross_sell_purchased:${opts.tripItemId}`
  const existing = await prisma.commercialEvent.findFirst({
    where:  { eventId: idempotencyKey },
    select: { id: true },
  }).catch(() => null)
  if (existing) return  // already recorded — webhook retry or duplicate call

  await trackDurableEvent('cross_sell_purchased', {
    eventId:     idempotencyKey,
    bookingId:   opts.bookingId,
    sessionId:   opts.sessionId,
    productType: opts.productType,
    amount:      opts.amount,
    currency:    opts.currency,
    metadata: {
      commercialSource:    'cross_sell',
      tripItemId:          opts.tripItemId,
      recommendationType:  opts.recommendationType,
      sourceProductType:   opts.sourceProductType,
    },
  })
}

export async function recordPostBookingUpsellPurchased(opts: PurchaseAttributionOpts): Promise<void> {
  const idempotencyKey = `post_booking_upsell_purchased:${opts.tripItemId}`
  const existing = await prisma.commercialEvent.findFirst({
    where:  { eventId: idempotencyKey },
    select: { id: true },
  }).catch(() => null)
  if (existing) return

  await trackDurableEvent('post_booking_upsell_purchased', {
    eventId:     idempotencyKey,
    bookingId:   opts.bookingId,
    sessionId:   opts.sessionId,
    productType: opts.productType,
    amount:      opts.amount,
    currency:    opts.currency,
    metadata: {
      commercialSource:    'post_booking_upsell',
      tripItemId:          opts.tripItemId,
      recommendationType:  opts.recommendationType,
      sourceProductType:   opts.sourceProductType,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Jade attribution propagation
//
// When a Booking is linked to a Lead (via Booking.leadId), and the lead is
// jade-assisted AND jadeQualifiedAt is within JADE_ATTRIBUTION_DAYS of now,
// set Booking.jadeAssisted = true on the booking record.
//
// Call this immediately after setting Booking.leadId.
// ─────────────────────────────────────────────────────────────────────────────

const JADE_ATTRIBUTION_DAYS = parseInt(process.env.JADE_ATTRIBUTION_DAYS ?? '7', 10)

export async function propagateJadeAttribution(bookingId: string, leadId: string): Promise<void> {
  try {
    const lead = await prisma.lead.findUnique({
      where:  { id: leadId },
      select: { jadeAssisted: true, jadeQualifiedAt: true },
    })
    if (!lead?.jadeAssisted || !lead.jadeQualifiedAt) return

    const windowStart = new Date(Date.now() - JADE_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000)
    if (lead.jadeQualifiedAt < windowStart) return

    await prisma.booking.update({
      where: { id: bookingId },
      data:  { jadeAssisted: true },
    })
  } catch (err) {
    console.warn('[Jade] propagateJadeAttribution failed (non-fatal):', (err as Error).message)
  }
}
