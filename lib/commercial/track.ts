import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'

export type CommercialEventName =
  | 'flight_search'
  | 'hotel_search'
  | 'activity_search'
  | 'product_view'
  | 'lead_created'
  | 'checkout_started'
  | 'payment_started'
  | 'payment_succeeded'
  | 'booking_confirmed'
  | 'jade_started'
  | 'jade_trip_intent'
  | 'proposal_viewed'
  | 'proposal_accepted'

export interface TrackOptions {
  sessionId?:   string
  userId?:      string
  leadId?:      string
  productType?: string
  productId?:   string
  destination?: string
  currency?:    string
  amount?:      number
  metadata?:    Record<string, unknown>
}

/**
 * Fire a commercial event — non-blocking, never throws.
 * Call from server-side API routes only; never await in a hot path.
 */
export function trackCommercialEvent(
  event: CommercialEventName,
  opts: TrackOptions = {},
): void {
  prisma.commercialEvent.create({
    data: {
      id:          generateId(),
      event,
      sessionId:   opts.sessionId   ?? null,
      userId:      opts.userId      ?? null,
      leadId:      opts.leadId      ?? null,
      productType: opts.productType ?? null,
      productId:   opts.productId   ?? null,
      destination: opts.destination ?? null,
      currency:    opts.currency    ?? null,
      amount:      opts.amount      ?? null,
      metadata:    opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
    },
  }).catch(err => {
    console.warn('[CommercialEvent] insert failed (non-fatal):', (err as Error).message)
  })
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'c'
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}
