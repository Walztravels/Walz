import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'

export const dynamic = 'force-dynamic'

const ABANDON_MINUTES = 60

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
  const abandonThreshold = new Date(Date.now() - ABANDON_MINUTES * 60 * 1000)

  const [
    // GBV buckets — payment captured vs supplier confirmed vs pending vs failed
    paymentCapturedGBV,
    confirmedGBV,
    pendingConfirmationGBV,
    failedAfterPaymentGBV,

    bookingsToday,
    bookingsWeek,
    activityMargin,
    esimOrders,
    leadsByStatus,
    leadsToday,
    leadsWeek,
    quotesOpen,
    abandonedCount,
    commercialEventFunnel,
    jadeAssistedBookings,
    cartActive,
    cartAbandoned,
    cartConverted,
    cartAbandonedValue,
    trackingStart,
  ] = await Promise.all([
    // All payments captured (paymentStatus = SUCCEEDED), regardless of booking status
    prisma.booking.groupBy({
      by: ['currency'],
      where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: since } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    }),

    // Confirmed GBV — paid AND supplier/Walz confirmed
    prisma.booking.groupBy({
      by: ['currency'],
      where: { paymentStatus: 'SUCCEEDED', status: 'CONFIRMED', createdAt: { gte: since } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    }),

    // Pending — paid but not yet confirmed
    prisma.booking.groupBy({
      by: ['currency'],
      where: { paymentStatus: 'SUCCEEDED', status: 'PENDING', createdAt: { gte: since } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    }),

    // Failed after payment — paid but supplier/booking failed
    prisma.booking.groupBy({
      by: ['currency'],
      where: { paymentStatus: 'SUCCEEDED', status: { in: ['FAILED', 'CANCELLED'] }, createdAt: { gte: since } },
      _sum:   { totalAmount: true },
      _count: { id: true },
    }),

    prisma.booking.count({ where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: today } } }),
    prisma.booking.count({ where: { paymentStatus: 'SUCCEEDED', createdAt: { gte: week  } } }),

    // Activity margin — only CONFIRMED bookings for realized margin
    prisma.activityBooking.aggregate({
      where: { status: 'CONFIRMED', createdAt: { gte: since } },
      _sum: { markupAmount: true, totalAmount: true, supplierNetAmount: true },
      _count: { id: true },
    }),

    // eSIM orders in window
    prisma.esimOrder.aggregate({
      where: { status: { not: 'cancelled' }, purchasedAt: { gte: since } },
      _sum: { marginUsd: true, retailPriceUsd: true },
      _count: { id: true },
    }),

    prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.lead.count({ where: { createdAt: { gte: today } } }),
    prisma.lead.count({ where: { createdAt: { gte: week  } } }),

    prisma.quote.findMany({
      where: { status: { in: ['draft', 'sent', 'viewed', 'accepted'] } },
      select: { status: true, currency: true, totalMinor: true, markupMinor: true, createdAt: true },
    }),

    // Legacy AbandonedSession (form-level abandonment — different from CartSession)
    prisma.abandonedSession.count({ where: { converted: false } }),

    // Commercial event funnel — unique sessionIds where possible
    prisma.commercialEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),

    prisma.booking.count({ where: { jadeAssisted: true } }),

    // CartSession counts
    prisma.cartSession.count({
      where: { convertedAt: null, updatedAt: { gte: abandonThreshold }, totalAmount: { gt: 0 } },
    }),
    prisma.cartSession.count({
      where: { convertedAt: null, updatedAt: { lt: abandonThreshold }, totalAmount: { gt: 0 } },
    }),
    prisma.cartSession.count({ where: { convertedAt: { not: null } } }),
    prisma.cartSession.aggregate({
      where: { convertedAt: null, updatedAt: { lt: abandonThreshold }, totalAmount: { gt: 0 } },
      _sum: { totalAmount: true },
    }),

    // Earliest CommercialEvent — indicates when tracking started
    prisma.commercialEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])

  // ── Format GBV buckets ───────────────────────────────────────────────────
  const formatGbv = (rows: { currency: string; _sum: { totalAmount: number | null }; _count: { id: number } }[]) =>
    rows.map(r => ({ currency: r.currency, total: r._sum.totalAmount ?? 0, count: r._count.id }))

  // ── Quote pipeline value by currency ────────────────────────────────────
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

  // ── Lead funnel ──────────────────────────────────────────────────────────
  const leadFunnel = leadsByStatus.map(r => ({ status: r.status, count: r._count.id }))
  const totalLeads = leadFunnel.reduce((s, r) => s + r.count, 0)

  // ── Commercial event funnel ──────────────────────────────────────────────
  const eventMap = commercialEventFunnel.reduce<Record<string, number>>((acc, r) => {
    acc[r.event] = r._count.id
    return acc
  }, {})

  const FUNNEL_STEPS = [
    'flight_search', 'hotel_search', 'activity_search', 'transfer_search',
    'product_view', 'lead_created', 'checkout_started',
    'payment_started', 'payment_succeeded', 'booking_confirmed',
  ]
  const funnelData = FUNNEL_STEPS.map(step => ({ event: step, count: eventMap[step] ?? 0 }))
  const trackingStarted = commercialEventFunnel.length > 0

  return NextResponse.json({
    window,
    trackingStartedAt: trackingStart?.createdAt ?? null,

    // Payment Captured = all SUCCEEDED payments (may include unconfirmed supplier bookings)
    paymentCaptured:   formatGbv(paymentCapturedGBV),
    // Confirmed GBV = supplier/Walz confirmed bookings only
    confirmedGBV:      formatGbv(confirmedGBV),
    // Paid but awaiting supplier confirmation
    pendingConfirmation: formatGbv(pendingConfirmationGBV),
    // Paid but supplier/booking failed — at-risk value
    failedAfterPayment:  formatGbv(failedAfterPaymentGBV),

    bookingsToday,
    bookingsWeek,

    activity: {
      count:       activityMargin._count.id,
      revenue:     activityMargin._sum.totalAmount ?? 0,
      margin:      activityMargin._sum.markupAmount ?? 0,
      supplierNet: activityMargin._sum.supplierNetAmount ?? 0,
      currency:    'GBP',
      note:        'Confirmed bookings only — at-risk margin excluded',
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

    // CartSession abandonment (Release 1.1)
    cart: {
      active:           cartActive,
      abandoned:        cartAbandoned,
      converted:        cartConverted,
      abandonedValue:   cartAbandonedValue._sum.totalAmount ?? 0,
      thresholdMinutes: ABANDON_MINUTES,
    },

    // Legacy form-level abandonment (AbandonedSession model)
    formAbandoned: abandonedCount,

    funnel:         funnelData,
    trackingStarted,

    jade: {
      assistedBookings: jadeAssistedBookings,
      attributionWindowDays: parseInt(process.env.JADE_ATTRIBUTION_DAYS ?? '7', 10),
    },
  })
}
