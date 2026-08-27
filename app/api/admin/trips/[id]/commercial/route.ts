// Admin trip commercial intelligence (2D.5)
//
// Returns revenue data, fulfillment status, and opportunity signals for a single trip.
// Rules-based signals only — no AI scoring (Release 3).
//
// Security: partnerNetPrice, supplierCost, internal markup NEVER returned.
// Multi-currency: amounts grouped by currency, never summed.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'
import { getTripItemsFulfillmentStatuses } from '@/lib/trips/fulfillment'
import { getCrossSellRecommendations }     from '@/lib/commercial/cross-sell'

export const dynamic = 'force-dynamic'

// Opportunity signals — rules-based, no AI.
type OpportunityLevel = 'HIGH' | 'MEDIUM' | 'LOW'

interface OpportunitySignal {
  level:          OpportunityLevel
  missingProduct: string
  reason:         string
}

function deriveOpportunitySignals(
  items: Array<{ type: string; confirmed: boolean }>,
  recommendations: ReturnType<typeof getCrossSellRecommendations>
): OpportunitySignal[] {
  const signals: OpportunitySignal[] = []

  const hasType = (t: string) => items.some(i => i.type.toUpperCase() === t)
  const hasFlight  = hasType('FLIGHT')
  const hasHotel   = hasType('HOTEL')

  for (const rec of recommendations) {
    let level: OpportunityLevel = 'LOW'

    // HIGH-value signals: flight without hotel or hotel without flight (core trip gap)
    if (rec.type === 'HOTEL' && hasFlight && !hasHotel)  level = 'HIGH'
    if (rec.type === 'FLIGHT' && hasHotel && !hasFlight) level = 'HIGH'
    if (rec.type === 'TRANSFER')                          level = 'MEDIUM'
    if (rec.type === 'ESIM')                              level = 'MEDIUM'

    signals.push({
      level,
      missingProduct: rec.type,
      reason:         rec.reason,
    })
  }

  return signals.sort((a, b) =>
    ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.level) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.level)
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tripId = params.id

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      id:          true,
      destination: true,
      origin:      true,
      adults:      true,
      children:    true,
      infants:     true,
      status:      true,
      items: {
        select: {
          id:         true,
          type:       true,
          title:      true,
          cost:       true,
          currency:   true,
          confirmed:  true,
          bookingRef: true,
          metadata:   true,
        },
      },
    },
  })

  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Fulfillment status per item ───────────────────────────────────────────
  let fulfillmentStatuses = new Map<string, string>()
  try {
    fulfillmentStatuses = await getTripItemsFulfillmentStatuses(
      trip.items.map(i => ({
        id:         i.id,
        bookingRef: i.bookingRef,
        confirmed:  i.confirmed,
        type:       i.type,
      })),
      { tripId }  // 2D.1.1: required for ESIM EsimOrder lookup
    )
  } catch { /* non-fatal */ }

  // ── Trip value by currency (never summed across currencies) ───────────────
  const tripValue: Record<string, { total: number; confirmedTotal: number; count: number }> = {}
  for (const item of trip.items) {
    const cur = (item.currency || 'GBP').toUpperCase()
    if (!tripValue[cur]) tripValue[cur] = { total: 0, confirmedTotal: 0, count: 0 }
    const cost = item.cost ?? 0
    tripValue[cur].total  += cost
    tripValue[cur].count  += 1
    const status = fulfillmentStatuses.get(item.id) ?? 'NOT_PURCHASED'
    if (status === 'CONFIRMED') tripValue[cur].confirmedTotal += cost
  }

  // ── Cross-sell GBV — from commercial events ───────────────────────────────
  // Items that were attributed to cross-sell purchases on this trip.
  // Note: This requires CommercialEvent.metadata.tripItemId linkage — data from 2D.3 onward.
  const crossSellEvents = await prisma.commercialEvent.findMany({
    where: {
      event: { in: ['cross_sell_purchased', 'post_booking_upsell_purchased'] },
      // No tripId on CommercialEvent — match by bookingId via ActivityBooking
      // For now, report trip-level via matching bookingRefs (best-effort)
    },
    select: { event: true, amount: true, currency: true, metadata: true },
    take: 100,
  })

  // Filter to this trip's bookingRefs
  const tripBookingRefs = new Set(trip.items.map(i => i.bookingRef).filter(Boolean))
  const crossSellGBV: Record<string, number> = {}
  for (const evt of crossSellEvents) {
    const meta = evt.metadata as Record<string, unknown> | null
    const tripItemId = meta?.tripItemId as string | undefined
    if (tripItemId && trip.items.some(i => i.id === tripItemId)) {
      const cur = (evt.currency || 'GBP').toUpperCase()
      crossSellGBV[cur] = (crossSellGBV[cur] ?? 0) + (evt.amount ?? 0)
    }
  }
  void tripBookingRefs // suppress unused warning

  // ── Opportunity signals (rules-based) ────────────────────────────────────
  let opportunities: OpportunitySignal[] = []
  try {
    const recs = getCrossSellRecommendations({
      destination: trip.destination ?? '',
      origin:      trip.origin      ?? null,
      adults:      trip.adults,
      children:    trip.children,
      infants:     trip.infants,
      items:       trip.items.map(i => ({
        type:     i.type,
        metadata: (i.metadata as Record<string, unknown>) ?? {},
      })),
    })
    opportunities = deriveOpportunitySignals(trip.items, recs)
  } catch { /* non-fatal */ }

  // ── Per-item commercial summary ───────────────────────────────────────────
  const itemSummaries = trip.items.map(i => ({
    id:                i.id,
    type:              i.type,
    title:             i.title,
    cost:              i.cost,
    currency:          i.currency,
    fulfillmentStatus: fulfillmentStatuses.get(i.id) ?? 'NOT_PURCHASED',
    bookingRef:        i.bookingRef,
    // partnerNetPrice, supplierCost intentionally absent
  }))

  return NextResponse.json({
    tripId:       trip.id,
    tripStatus:   trip.status,
    tripValue,             // by currency — never summed
    crossSellGBV,          // attributed cross-sell revenue by currency
    productCount: trip.items.length,
    confirmedCount: trip.items.filter(i => fulfillmentStatuses.get(i.id) === 'CONFIRMED').length,
    opportunities,
    items: itemSummaries,
    marginNote: 'Hotel and flight margin not yet tracked. Activity margin available in /admin/revenue.',
  })
}
