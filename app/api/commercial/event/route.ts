import { NextRequest, NextResponse } from 'next/server'
import prisma                       from '@/lib/db'
import { trackCommercialEvent, type CommercialEventName } from '@/lib/commercial/track'

export const dynamic = 'force-dynamic'

// Allowlist: only analytics/intent events accepted from the browser.
// Blocked server-only events (never accepted from browser):
//   payment_succeeded, payment_failed, booking_confirmed,
//   supplier_booking_failed, reconciliation_required, refund_processed
//   cross_sell_added, cross_sell_purchased, post_booking_upsell_added,
//   post_booking_upsell_purchased — all server-authoritative; browser MUST NOT fire these.
const BROWSER_SAFE_EVENTS = new Set<CommercialEventName>([
  'flight_search',
  'hotel_search',
  'activity_search',
  'transfer_search',
  'product_view',
  'jade_started',
  'jade_trip_intent',
  'cross_sell_shown',
  'cross_sell_clicked',
  'post_booking_upsell_shown',    // shown on success page — intent signal, not revenue
  'post_booking_upsell_clicked',  // CTA clicked — intent signal, not revenue
])

// POST /api/commercial/event — ingest client-side commercial events
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const { event, eventId, sessionId, userId, productType, productId, destination, currency, amount, metadata } =
    (body as Record<string, unknown>) ?? {}

  if (!event || !BROWSER_SAFE_EVENTS.has(event as CommercialEventName)) {
    // Never tell the client which events are server-only — just reject unknown events
    return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 })
  }

  // Deduplicate: if eventId was provided and already exists, skip silently
  if (typeof eventId === 'string' && eventId.length > 0) {
    const existing = await prisma.commercialEvent.findFirst({
      where: { eventId: eventId.slice(0, 64) },
      select: { id: true },
    }).catch(() => null)
    if (existing) return NextResponse.json({ ok: true, deduplicated: true })
  }

  trackCommercialEvent(event as CommercialEventName, {
    eventId:     typeof eventId     === 'string' ? eventId.slice(0, 64)     : undefined,
    sessionId:   typeof sessionId   === 'string' ? sessionId.slice(0, 64)   : undefined,
    userId:      typeof userId      === 'string' ? userId.slice(0, 64)      : undefined,
    productType: typeof productType === 'string' ? productType.slice(0, 32) : undefined,
    productId:   typeof productId   === 'string' ? productId.slice(0, 64)   : undefined,
    destination: typeof destination === 'string' ? destination.slice(0, 64) : undefined,
    currency:    typeof currency    === 'string' ? currency.slice(0, 8)     : undefined,
    amount:      typeof amount      === 'number' ? amount                   : undefined,
    // Strip any server-sensitive fields from browser metadata
    metadata:    sanitizeBrowserMetadata(metadata),
  })

  return NextResponse.json({ ok: true })
}

function sanitizeBrowserMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const m = raw as Record<string, unknown>
  // Reject fields that could contain sensitive data
  const BLOCKED = ['supplierCost', 'grossProfit', 'margin', 'markup', 'partnerNetPrice',
    'supplierNetAmount', 'wholesaleCost', 'apiKey', 'secret', 'password', 'token']
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(m)) {
    if (!BLOCKED.some(b => k.toLowerCase().includes(b.toLowerCase()))) {
      safe[k] = v
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined
}
