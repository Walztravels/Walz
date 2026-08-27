import { NextRequest, NextResponse } from 'next/server'
import { trackCommercialEvent, type CommercialEventName } from '@/lib/commercial/track'

export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set<CommercialEventName>([
  'flight_search', 'hotel_search', 'activity_search', 'product_view',
  'checkout_started', 'payment_started', 'jade_started', 'jade_trip_intent',
])

// POST /api/commercial/event — ingest client-side commercial events
// Only a subset of events are accepted from the browser (no lead/payment success — those come from server)
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const { event, sessionId, userId, productType, productId, destination, currency, amount, metadata } =
    (body as Record<string, unknown>) ?? {}

  if (!event || !ALLOWED_EVENTS.has(event as CommercialEventName)) {
    return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 })
  }

  trackCommercialEvent(event as CommercialEventName, {
    sessionId:   typeof sessionId   === 'string' ? sessionId.slice(0, 64)   : undefined,
    userId:      typeof userId      === 'string' ? userId.slice(0, 64)      : undefined,
    productType: typeof productType === 'string' ? productType.slice(0, 32) : undefined,
    productId:   typeof productId   === 'string' ? productId.slice(0, 64)   : undefined,
    destination: typeof destination === 'string' ? destination.slice(0, 64) : undefined,
    currency:    typeof currency    === 'string' ? currency.slice(0, 8)     : undefined,
    amount:      typeof amount      === 'number' ? amount                   : undefined,
    metadata:    typeof metadata    === 'object' && metadata !== null ? metadata as Record<string, unknown> : undefined,
  })

  return NextResponse.json({ ok: true })
}
