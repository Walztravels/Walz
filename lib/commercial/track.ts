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
  | 'booking_confirmed'
  | 'supplier_booking_failed'
  | 'jade_started'
  | 'jade_trip_intent'
  | 'proposal_viewed'
  | 'proposal_accepted'

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
