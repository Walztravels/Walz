import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'
import { getTripItemsFulfillmentStatuses, type FulfillmentStatus } from '@/lib/trips/fulfillment'
import { getCrossSellRecommendations } from '@/lib/commercial/cross-sell'
import { getSmartRecommendations }     from '@/lib/jade/recommendations'

export const dynamic = 'force-dynamic'

// JadeTripSummary — read-only view of a Trip for Jade's context.
// Security invariants (2D.5):
//   - rateKey NEVER exposed (Hotelbeds re-booking risk)
//   - supplierCost / partnerNetPrice NEVER exposed
//   - sourceId stripped for hotel items (contains rateKey for some suppliers)
//   - metadata intentionally excluded (may contain rateKey)
//   - Jade is READ + RECOMMEND + DEEPLINK only — no PURCHASE/CHARGE/CONFIRM capability
export interface JadeTripItem {
  id:                string
  type:              string
  title:             string
  location:          string | null
  startTime:         string | null
  cost:              number | null
  currency:          string
  confirmed:         boolean
  dayId:             string | null
  fulfillmentStatus: FulfillmentStatus   // 2D.5: authoritative per-item status
  bookingRef:        string | null        // 2D.5: Walz reference (not supplier credential)
}

export interface JadeTripSummary {
  id:                 string
  destination:        string | null
  origin:             string | null
  adults:             number
  children:           number
  infants:            number
  status:             string
  itemCount:          number
  items:              JadeTripItem[]
  missingCategories:  string[]            // 2D.5: product types absent from this trip
  smartRecommendations?: Array<{          // Release 7.3: jade-engine recs (optional — non-fatal)
    type:     string
    reason:   string
    ctaLabel: string
    ctaHref?: string
  }>
}

// GET /api/jade/trip-context?tripId=xxx
// Auth-gated: only the trip owner may request it.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get('tripId')
  if (!tripId) {
    return NextResponse.json({ error: 'tripId required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      id:          true,
      userId:      true,
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
          location:   true,
          startTime:  true,
          cost:       true,
          currency:   true,
          confirmed:  true,
          dayId:      true,
          bookingRef: true,  // Walz reference — safe to expose; not a supplier credential
          // sourceId intentionally excluded — may contain rateKey for hotel items
          // metadata intentionally excluded — may contain rateKey
        },
        orderBy: [{ dayId: 'asc' }, { order: 'asc' }],
      },
    },
  })

  if (!trip || trip.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── 2D.5: Authoritative fulfillment status per item (batch query) ─────────
  let fulfillmentStatuses = new Map<string, FulfillmentStatus>()
  try {
    fulfillmentStatuses = await getTripItemsFulfillmentStatuses(
      trip.items.map(i => ({
        id:         i.id,
        bookingRef: i.bookingRef,
        confirmed:  i.confirmed,
        type:       i.type,
      })),
      { tripId: trip.id }  // 2D.1.1: required for ESIM EsimOrder lookup
    )
  } catch (err) {
    console.warn('[JadeTripContext] fulfillment status lookup failed (non-fatal):', (err as Error).message)
  }

  // ── 2D.5: Missing categories (cross-sell recommendations) ────────────────
  // Tells Jade what products are absent — for recommendations only.
  // Jade may SUGGEST (via deeplink) but never PURCHASE autonomously.
  let missingCategories: string[] = []
  try {
    const recs = getCrossSellRecommendations({
      destination: trip.destination ?? '',
      origin:      trip.origin      ?? null,
      adults:      trip.adults,
      children:    trip.children,
      infants:     trip.infants,
      items:       trip.items.map(i => ({ type: i.type, metadata: {} })),
    })
    missingCategories = [...new Set(recs.map(r => r.type))]
  } catch { /* non-fatal */ }

  // ── Release 7.3: Smart recommendations via jade engine ───────────────────
  // getSmartRecommendations also fires jade_cross_sell_eligible/offered events.
  let smartRecommendations: JadeTripSummary['smartRecommendations'] = []
  try {
    smartRecommendations = getSmartRecommendations(
      {
        destination: trip.destination ?? '',
        origin:      trip.origin ?? null,
        startDate:   null,
        endDate:     null,
        adults:      trip.adults,
        children:    trip.children,
        currency:    'GBP',
        budget:      null,
        items:       trip.items.map(i => ({ type: i.type, metadata: {} })),
      },
      trip.id,
    )
  } catch { /* non-fatal */ }

  const summary: JadeTripSummary = {
    id:          trip.id,
    destination: trip.destination ?? null,
    origin:      trip.origin      ?? null,
    adults:      trip.adults,
    children:    trip.children,
    infants:     trip.infants,
    status:      trip.status,
    itemCount:   trip.items.length,
    missingCategories,
    smartRecommendations,
    items: trip.items.map(i => ({
      id:                i.id,
      type:              i.type,
      title:             i.title,
      location:          i.location,
      startTime:         i.startTime,
      cost:              i.cost,
      currency:          i.currency,
      confirmed:         i.confirmed,
      dayId:             i.dayId,
      fulfillmentStatus: fulfillmentStatuses.get(i.id) ?? 'NOT_PURCHASED',
      bookingRef:        i.bookingRef,
    })),
  }

  return NextResponse.json(summary, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
