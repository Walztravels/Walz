import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'

export const dynamic = 'force-dynamic'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url    = new URL(req.url)
  const window = parseInt(url.searchParams.get('window') ?? '30', 10)
  const since  = daysAgo(window)
  const today  = daysAgo(0)
  const week   = daysAgo(7)

  const [
    bookingsAll,
    bookingsToday,
    bookingsWeek,
    activityMargin,
    esimOrders,
    leadsByStatus,
    leadsToday,
    leadsWeek,
    quotesOpen,
    abandonedCount,
    commercialEvents,
    jadeAssistedBookings,
  ] = await Promise.all([
    // GBV by currency — paid bookings in window
    prisma.booking.groupBy({
      by: ['currency'],
      where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: since } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    }),

    // Today's bookings count
    prisma.booking.count({ where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: today } } }),

    // This week's bookings count
    prisma.booking.count({ where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: week } } }),

    // Activity margin in window
    prisma.activityBooking.aggregate({
      where: { paymentStatus: 'PAID', createdAt: { gte: since } },
      _sum: { markupAmount: true, totalAmount: true, supplierNetAmount: true },
      _count: { id: true },
    }),

    // eSIM orders in window
    prisma.esimOrder.aggregate({
      where: { status: { not: 'cancelled' }, purchasedAt: { gte: since } },
      _sum: { marginUsd: true, retailPriceUsd: true },
      _count: { id: true },
    }),

    // Lead funnel by status
    prisma.lead.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // New leads today
    prisma.lead.count({ where: { createdAt: { gte: today } } }),

    // New leads this week
    prisma.lead.count({ where: { createdAt: { gte: week } } }),

    // Open quotes pipeline
    prisma.quote.findMany({
      where: { status: { in: ['draft', 'sent', 'viewed', 'accepted'] } },
      select: { status: true, currency: true, totalMinor: true, markupMinor: true, createdAt: true },
    }),

    // Abandoned sessions not converted
    prisma.abandonedSession.count({ where: { converted: false } }),

    // Commercial event funnel (last 30d)
    prisma.commercialEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Jade-assisted bookings
    prisma.booking.count({ where: { jadeAssisted: true } }),
  ])

  // GBV grouped by currency
  const gbv = bookingsAll.map(row => ({
    currency: row.currency,
    total:    row._sum.totalAmount ?? 0,
    count:    row._count.id,
  }))

  // Quote pipeline value by currency
  const quotePipeline: Record<string, { total: number; markup: number; count: number }> = {}
  for (const q of quotesOpen) {
    const cur = q.currency
    if (!quotePipeline[cur]) quotePipeline[cur] = { total: 0, markup: 0, count: 0 }
    quotePipeline[cur].total  += Number(q.totalMinor)  / 100
    quotePipeline[cur].markup += Number(q.markupMinor) / 100
    quotePipeline[cur].count  += 1
  }

  const quotesByStatus = quotesOpen.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1
    return acc
  }, {})

  // Lead funnel
  const leadFunnel = leadsByStatus.map(r => ({ status: r.status, count: r._count.id }))
  const totalLeads = leadFunnel.reduce((s, r) => s + r.count, 0)

  // Commercial event funnel
  const eventMap = commercialEvents.reduce<Record<string, number>>((acc, r) => {
    acc[r.event] = r._count.id
    return acc
  }, {})

  const FUNNEL_STEPS = [
    'flight_search', 'hotel_search', 'activity_search', 'product_view',
    'checkout_started', 'payment_started', 'payment_succeeded', 'booking_confirmed',
  ]
  const funnelData = FUNNEL_STEPS.map(step => ({ event: step, count: eventMap[step] ?? 0 }))
  const trackingStarted = commercialEvents.length > 0

  return NextResponse.json({
    window,
    gbv,
    bookingsToday,
    bookingsWeek,
    activity: {
      count:       activityMargin._count.id,
      revenue:     activityMargin._sum.totalAmount ?? 0,
      margin:      activityMargin._sum.markupAmount ?? 0,
      supplierNet: activityMargin._sum.supplierNetAmount ?? 0,
      currency:    'GBP',
    },
    esim: {
      count:   esimOrders._count.id,
      revenue: esimOrders._sum.retailPriceUsd ?? 0,
      margin:  esimOrders._sum.marginUsd ?? 0,
      currency: 'USD',
    },
    leads: {
      today: leadsToday,
      week:  leadsWeek,
      total: totalLeads,
      funnel: leadFunnel,
    },
    quotes: {
      pipeline:    quotePipeline,
      byStatus:    quotesByStatus,
      totalOpen:   quotesOpen.length,
    },
    abandoned:      abandonedCount,
    funnel:         funnelData,
    trackingStarted,
    jade: {
      assistedBookings: jadeAssistedBookings,
    },
  })
}
