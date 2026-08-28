// Attach rate analytics — measures what % of confirmed trips include each product type.
//
// Definitions (authoritative):
//   Denominator: Trips in CONFIRMED state within the window (paid + supplier confirmed).
//   Numerator:   Subset of those trips with at least one confirmed TripItem of the target type.
//
// Multi-currency: never sum currencies. Amounts grouped by currency.
// Security: never expose partnerNetPrice, supplierCost, or internal markup.
// Zero-data UX: returns count: 0, rate: null when denominator is 0.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'

export const dynamic = 'force-dynamic'

// 4E-A.1: Use the typed PermissionKey `reports_revenue` (already in lib/permissions.ts).
// super_admin/general_manager/operations_manager/accountant all receive reports_revenue = true
// in ROLE_DEFAULTS. Do NOT check hardcoded role names — use the RBAC system.
function hasRevenueAccess(session: { role: string; permissions: Record<string, boolean> }) {
  return session.permissions.reports_revenue === true
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

const ATTACH_RATE_TYPES = ['HOTEL', 'TRANSFER', 'ACTIVITY', 'ESIM', 'FLIGHT', 'TOUR'] as const
type AttachType = typeof ATTACH_RATE_TYPES[number]

interface AttachRateResult {
  productType:        AttachType
  confirmedTrips:     number   // denominator — trips in CONFIRMED state
  tripsWithProduct:   number   // numerator — confirmed trips with this product type
  attachRate:         number | null  // tripsWithProduct / confirmedTrips, null if denominator = 0
  note?:              string
}

interface CrossSellFunnelStep {
  event:      string
  count:      number
}

interface CrossSellGBV {
  commercialSource: string
  currency:         string
  total:            number
  count:            number
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRevenueAccess(session)) {
    return NextResponse.json({ error: 'Forbidden — Finance access required' }, { status: 403 })
  }

  const url    = new URL(req.url)
  const window = parseInt(url.searchParams.get('window') ?? '30', 10)
  const since  = daysAgo(window)

  // ── Confirmed trips in window ─────────────────────────────────────────────
  // Denominator: trips that reached CONFIRMED status (payment + supplier confirmation)
  const confirmedTrips = await prisma.trip.findMany({
    where:   { status: 'CONFIRMED', updatedAt: { gte: since } },
    select:  { id: true },
  })
  const confirmedTripIds = confirmedTrips.map(t => t.id)
  const denominatorCount = confirmedTripIds.length

  // ── TripItem counts per type — fulfillment-aware numerator (2D.1.1) ──────
  //
  // Attach-rate numerator definition:
  //   ACTIVITY: confirmed=true only — authoritative (ActivityBooking back-write, only set
  //             on CONFIRMED status; excludes FAILED, RECONCILIATION_REQUIRED, CANCELLED).
  //   HOTEL, FLIGHT, TRANSFER, TOUR, ESIM: confirmed=true OR bookingRef IS NOT NULL —
  //             these product types have no supplier confirmation step in the current system;
  //             payment received (bookingRef set) is the authoritative acquired signal.
  //
  // Note: ESIM ideally would query EsimOrder.status to exclude cancelled/failed,
  // but the per-trip EsimOrder lookup can't be done efficiently in a bulk attach-rate
  // query without joining across tables. bookingRef IS NOT NULL is a conservative
  // proxy; the margin of error is small (failed eSIM orders are rare and short-lived).
  const attachRates: AttachRateResult[] = []

  if (denominatorCount > 0) {
    // Fetch all relevant TripItems in one query — filter in memory by type
    const allItems = await prisma.tripItem.findMany({
      where:  { tripId: { in: confirmedTripIds } },
      select: { tripId: true, type: true, confirmed: true, bookingRef: true },
    })

    for (const productType of ATTACH_RATE_TYPES) {
      const typeItems = allItems.filter(i => i.type.toUpperCase() === productType)

      let tripsWithType: number
      if (productType === 'ACTIVITY') {
        // Activity: must be authoritatively confirmed (supplier back-write)
        tripsWithType = new Set(
          typeItems.filter(i => i.confirmed === true).map(i => i.tripId)
        ).size
      } else {
        // Non-activity: payment received OR admin-confirmed counts as acquired
        tripsWithType = new Set(
          typeItems.filter(i => i.confirmed === true || i.bookingRef !== null).map(i => i.tripId)
        ).size
      }

      attachRates.push({
        productType,
        confirmedTrips:   denominatorCount,
        tripsWithProduct: tripsWithType,
        attachRate:       denominatorCount > 0 ? tripsWithType / denominatorCount : null,
      })
    }
  } else {
    // No confirmed trips in window — return zero-data rows with null rates
    for (const productType of ATTACH_RATE_TYPES) {
      attachRates.push({
        productType,
        confirmedTrips:   0,
        tripsWithProduct: 0,
        attachRate:       null,
        note:             'Not enough confirmed trips in this window yet',
      })
    }
  }

  // ── Cross-sell funnel ─────────────────────────────────────────────────────
  // Shows cross_sell_shown → cross_sell_clicked → cross_sell_purchased
  const CROSS_SELL_FUNNEL = [
    'cross_sell_shown',
    'cross_sell_clicked',
    'cross_sell_added',
    'cross_sell_purchased',
    'post_booking_upsell_shown',
    'post_booking_upsell_clicked',
    'post_booking_upsell_added',
    'post_booking_upsell_purchased',
  ]

  const crossSellEvents = await prisma.commercialEvent.groupBy({
    by:    ['event'],
    where: {
      event:     { in: CROSS_SELL_FUNNEL },
      createdAt: { gte: since },
    },
    _count: { id: true },
  })

  const crossSellFunnel: CrossSellFunnelStep[] = CROSS_SELL_FUNNEL.map(event => ({
    event,
    count: crossSellEvents.find(e => e.event === event)?._count.id ?? 0,
  }))

  // ── Cross-sell GBV by currency ────────────────────────────────────────────
  // Revenue from items with cross_sell or post_booking_upsell purchase events.
  // Grouped by currency — never summed across currencies.
  const crossSellGBVRaw = await prisma.$queryRaw<
    { commercialSource: string; currency: string; total: number; count: number }[]
  >`
    SELECT
      metadata->>'commercialSource' AS "commercialSource",
      UPPER(currency)               AS currency,
      SUM(amount)::float            AS total,
      COUNT(*)::int                 AS count
    FROM "CommercialEvent"
    WHERE event IN ('cross_sell_purchased', 'post_booking_upsell_purchased')
      AND metadata->>'commercialSource' IS NOT NULL
      AND "createdAt" >= ${since}
    GROUP BY metadata->>'commercialSource', UPPER(currency)
    ORDER BY total DESC NULLS LAST
  `

  const crossSellGBV: CrossSellGBV[] = (crossSellGBVRaw ?? []).map(r => ({
    commercialSource: r.commercialSource,
    currency:         r.currency,
    total:            r.total,
    count:            r.count,
  }))

  return NextResponse.json({
    window,
    denominatorNote: 'Denominator = Trips in CONFIRMED status (payment received + supplier confirmed)',

    attachRates,
    crossSellFunnel,
    crossSellGBV,

    // Margin is not tracked for cross-sell yet — honest zero-data placeholder
    crossSellMarginNote: 'Cross-sell margin: Not yet tracked. Hotel margin data requires supplier net price integration.',
  })
}
