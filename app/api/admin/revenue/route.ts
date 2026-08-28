import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'
import {
  buildDateRange,
  previousPeriod,
  buildJadeAnalyticsContext,
  REPORTING_TIMEZONE,
  type DateRangePreset,
  type JadeAnalyticsContext,
} from '@/lib/commercial/metrics'
import {
  getExecutiveMetrics,
  getGBVBuckets,
  getJadeContribution,
  getJadeFunnel,
  getSearchAnalytics,
  getProductAnalytics,
  getProposalAnalytics,
  getCheckoutAnalytics,
  getPaymentAnalytics,
  getFulfillmentAnalytics,
  getRecoveryMetrics,
  getLeadQualityAnalytics,
  getJadeToolPerformance,
  getStaffAnalytics,
  getDataHealthDiagnostics,
} from '@/lib/commercial/jade-analytics'

export const dynamic = 'force-dynamic'

const ABANDON_MINUTES = 60

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// 4E-A.1: Use the typed PermissionKey `reports_revenue` (already in lib/permissions.ts).
// super_admin/general_manager/operations_manager/accountant all receive reports_revenue = true
// in ROLE_DEFAULTS. Additional staff may be granted it via per-staff permission overrides.
// Do NOT check hardcoded role names — use the RBAC system.
function hasRevenueAccess(session: { role: string; permissions: Record<string, boolean> }) {
  return session.permissions.reports_revenue === true
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
    paymentsByProviderRaw,
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

    // Payment breakdown by provider — from CommercialEvent metadata
    prisma.$queryRaw<{ provider: string; currency: string; total: number; count: number }[]>`
      SELECT
        metadata->>'provider'  AS provider,
        UPPER(currency)         AS currency,
        SUM(amount)::float      AS total,
        COUNT(*)::int           AS count
      FROM "CommercialEvent"
      WHERE event = 'payment_succeeded'
        AND metadata->>'provider' IS NOT NULL
        AND "createdAt" >= ${since}
      GROUP BY metadata->>'provider', UPPER(currency)
      ORDER BY total DESC NULLS LAST
    `,
  ])

  // ── Recovery analytics (Release 3D) ─────────────────────────────────────
  // isManagement: use reports_revenue permission for consistency with the gate above.
  // Staff without this permission get scoped results; management see all.
  const isManagement = session.permissions.reports_revenue === true

  const [
    openOppsByCurrency,
    recoveredGbvByCurrency,
    closedStatusCounts,
    typeStatusCounts,
  ] = await Promise.all([
    prisma.recoveryOpportunity.groupBy({
      by:    ['currency'],
      where: { status: { in: ['OPEN', 'CONTACTED', 'IN_PROGRESS'] }, detectedAt: { gte: since }, currency: { not: null } },
      _sum:  { amount: true },
      _count: { id: true },
    }),
    prisma.recoveryOpportunity.groupBy({
      by:    ['recoveredCurrency'],
      where: { status: 'RECOVERED', detectedAt: { gte: since }, recoveredCurrency: { not: null } },
      _sum:  { recoveredAmount: true },
      _count: { id: true },
    }),
    prisma.recoveryOpportunity.groupBy({
      by:    ['status'],
      where: { status: { in: ['RECOVERED', 'LOST'] }, detectedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.recoveryOpportunity.groupBy({
      by:    ['type', 'status'],
      where: { detectedAt: { gte: since } },
      _count: { id: true },
    }),
  ])

  const staffPerfRows = isManagement
    ? await prisma.recoveryOpportunity.findMany({
        where:  { detectedAt: { gte: since }, assignedToId: { not: null } },
        select: { assignedToId: true, status: true, contactCount: true, recoveredAmount: true, recoveredCurrency: true },
      })
    : []

  // Format open value and recovered GBV by currency
  const openValueByCurrency = openOppsByCurrency.map(r => ({
    currency: r.currency as string,
    total:    r._sum.amount ?? 0,
    count:    r._count.id,
  }))
  const recoveredGbv = recoveredGbvByCurrency.map(r => ({
    currency: r.recoveredCurrency as string,
    total:    r._sum.recoveredAmount ?? 0,
    count:    r._count.id,
  }))

  // Recovery rate — denominator: closed (recovered + lost) in window only
  const closedMap = closedStatusCounts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count.id; return acc
  }, {})
  const recoveredCount = closedMap['RECOVERED'] ?? 0
  const lostCount      = closedMap['LOST']      ?? 0
  const closedTotal    = recoveredCount + lostCount
  const recoveryRate   = closedTotal > 0 ? Math.round((recoveredCount / closedTotal) * 100) : null

  // By-type breakdown
  const typeMap: Record<string, { open: number; recovered: number; lost: number; dismissed: number; total: number }> = {}
  for (const row of typeStatusCounts) {
    if (!typeMap[row.type]) typeMap[row.type] = { open: 0, recovered: 0, lost: 0, dismissed: 0, total: 0 }
    const n = row._count.id
    typeMap[row.type].total += n
    if (['OPEN', 'CONTACTED', 'IN_PROGRESS'].includes(row.status)) typeMap[row.type].open      += n
    else if (row.status === 'RECOVERED')                            typeMap[row.type].recovered  += n
    else if (row.status === 'LOST')                                 typeMap[row.type].lost       += n
    else if (row.status === 'DISMISSED')                            typeMap[row.type].dismissed  += n
  }
  const byType = Object.entries(typeMap).map(([type, v]) => ({ type, ...v }))

  // Staff performance — management only
  type StaffPerfRow = { assignedToId: string; name: string; total: number; contacted: number; recovered: number; recoveredValue: Record<string, number> }
  let staffPerformance: StaffPerfRow[] = []

  if (isManagement && staffPerfRows.length > 0) {
    const perfMap: Record<string, Omit<StaffPerfRow, 'name'>> = {}
    for (const row of staffPerfRows) {
      const id = row.assignedToId as string
      if (!perfMap[id]) perfMap[id] = { assignedToId: id, total: 0, contacted: 0, recovered: 0, recoveredValue: {} }
      perfMap[id].total++
      if (row.contactCount > 0)       perfMap[id].contacted++
      if (row.status === 'RECOVERED') {
        perfMap[id].recovered++
        if (row.recoveredAmount != null && row.recoveredCurrency) {
          const cur = row.recoveredCurrency
          perfMap[id].recoveredValue[cur] = (perfMap[id].recoveredValue[cur] ?? 0) + row.recoveredAmount
        }
      }
    }
    const staffIds   = Object.keys(perfMap)
    const staffNames = await prisma.staff.findMany({
      where:  { id: { in: staffIds } },
      select: { id: true, name: true },
    })
    const nameMap = Object.fromEntries(staffNames.map(s => [s.id, s.name]))
    staffPerformance = Object.values(perfMap)
      .map(p => ({ ...p, name: nameMap[p.assignedToId] ?? 'Unknown' }))
      .sort((a, b) => b.recovered - a.recovered)
  }

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

  // ── Jade Commerce Analytics (Release 4E-B → 4E-F) ─────────────────────────
  const jadeAnalyticsEnabled = process.env.JADE_COMMERCE_ANALYTICS_ENABLED === 'true'
  let jadeAnalytics: Record<string, unknown> = { enabled: false }

  if (jadeAnalyticsEnabled) {
    // Phase 3: Support custom date range via ?jadeRange=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
    const VALID_JADE_PRESETS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month']
    const rawJadeRange = url.searchParams.get('jadeRange') ?? '30d'
    const isoDateRe    = /^\d{4}-\d{2}-\d{2}$/
    let jadeRange
    if (rawJadeRange === 'custom') {
      const fromStr = url.searchParams.get('from') ?? ''
      const toStr   = url.searchParams.get('to')   ?? ''
      if (isoDateRe.test(fromStr) && isoDateRe.test(toStr) && fromStr <= toStr) {
        jadeRange = buildDateRange({ from: fromStr, to: toStr })
      } else {
        jadeRange = buildDateRange('30d')  // invalid custom params → safe fallback
      }
    } else {
      const jadePreset = (VALID_JADE_PRESETS.includes(rawJadeRange) ? rawJadeRange : '30d') as DateRangePreset
      jadeRange = buildDateRange(jadePreset)
    }
    const jadePrevRange = previousPeriod(jadeRange)

    const jadeOpts     = { range: jadeRange,     jadeFilter: 'JADE_ASSISTED' as const }
    const jadePrevOpts = { range: jadePrevRange, jadeFilter: 'JADE_ASSISTED' as const }

    // Phase 11: build Jade analytics context once; all functions reuse the pre-fetched lead IDs.
    const jadeCtx: JadeAnalyticsContext = await buildJadeAnalyticsContext(jadeRange)
    const jadePrevCtx: JadeAnalyticsContext = { allJadeLeadIds: jadeCtx.allJadeLeadIds, rangeJadeLeadIds: [] }

    // All analytics run in parallel; section-level errors isolated via Promise.allSettled
    const [
      execRes, execPrevRes, gbvRes, contributionRes, funnelRes,
      searchRes, productsRes, proposalsRes, checkoutRes, paymentsRes,
      fulfillmentRes, recoveryRes, leadQualityRes, staffRes, jadeToolsRes, dataHealthRes,
    ] = await Promise.allSettled([
      getExecutiveMetrics(jadeOpts, jadeCtx),
      getExecutiveMetrics(jadePrevOpts, jadePrevCtx),
      getGBVBuckets(jadeOpts, jadeCtx),
      getJadeContribution(jadeRange, jadeCtx),
      getJadeFunnel(jadeRange, jadeCtx),
      getSearchAnalytics(jadeRange),
      getProductAnalytics(jadeRange, jadeCtx),
      getProposalAnalytics(jadeOpts, jadeCtx),
      getCheckoutAnalytics(jadeRange),
      getPaymentAnalytics(jadeRange),
      getFulfillmentAnalytics(jadeOpts, jadeCtx),
      getRecoveryMetrics(jadeOpts, jadeCtx),
      getLeadQualityAnalytics(jadeOpts, jadeCtx),
      isManagement ? getStaffAnalytics(jadeRange) : Promise.resolve(null),
      getJadeToolPerformance(jadeRange),
      isManagement ? getDataHealthDiagnostics() : Promise.resolve(null),
    ])

    function unwrap<T>(res: PromiseSettledResult<T>, name: string): T | null {
      if (res.status === 'fulfilled') return res.value
      console.error(`[4E] jade.${name} failed:`, (res.reason as Error)?.message ?? res.reason)
      return null
    }

    const executive    = unwrap(execRes, 'executive')
    const execPrev     = unwrap(execPrevRes, 'executivePrev')
    const gbv          = unwrap(gbvRes, 'gbv')
    const contribution = unwrap(contributionRes, 'contribution')
    const funnel       = unwrap(funnelRes, 'funnel')
    const search       = unwrap(searchRes, 'search')
    const products     = unwrap(productsRes, 'products')
    const proposals    = unwrap(proposalsRes, 'proposals')
    const checkout     = unwrap(checkoutRes, 'checkout')
    const payments     = unwrap(paymentsRes, 'payments')
    const fulfillment  = unwrap(fulfillmentRes, 'fulfillment')
    const recovery4e   = unwrap(recoveryRes, 'recovery')
    const leadQuality  = unwrap(leadQualityRes, 'leadQuality')
    const staff        = isManagement ? unwrap(staffRes, 'staff') : null
    const jadeTools    = unwrap(jadeToolsRes, 'jadeTools')
    const dataHealth   = isManagement ? unwrap(dataHealthRes, 'dataHealth') : null

    // Funnel drop-offs — ordered by drop rate desc
    const dropoffs = (funnel?.stages ?? [])
      .slice(0, -1)
      .map((stage, i) => {
        const next = funnel!.stages[i + 1]
        return {
          from:     stage.label,
          to:       next.label,
          dropped:  Math.max(0, stage.count - next.count),
          dropRate: stage.count > 0
            ? Math.round(((stage.count - next.count) / stage.count) * 100)
            : null,
        }
      })
      .filter(d => d.dropped > 0)
      .sort((a, b) => (b.dropRate ?? 0) - (a.dropRate ?? 0))

    // Deterministic summary (no LLM)
    const bCurr = executive?.confirmedBookings ?? 0
    const bPrev = execPrev?.confirmedBookings  ?? 0
    const bChange = bPrev > 0 ? Math.round(((bCurr - bPrev) / bPrev) * 100) : null
    const bookingTrend = bChange === null
      ? `${bCurr} Jade-assisted booking${bCurr !== 1 ? 's' : ''} confirmed this period`
      : `Jade-assisted bookings ${bChange >= 0 ? 'up' : 'down'} ${Math.abs(bChange)}% vs prior period`
    const largestDropoff = dropoffs[0]?.dropRate != null
      ? `Largest funnel drop: ${dropoffs[0].from} → ${dropoffs[0].to} (${dropoffs[0].dropRate}% fall-off)`
      : null
    const pendingLines = (gbv?.pendingConfirmation ?? [])
      .map(c => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c.currency, maximumFractionDigits: 0 }).format(c.amount))
      .join(', ')
    const pendingConfirmation = (gbv?.pendingConfirmation?.length ?? 0) > 0
      ? `${pendingLines} pending supplier confirmation`
      : null

    // Which sections had errors
    const sectionErrors: Record<string, boolean> = {
      executive: execRes.status === 'rejected', gbv: gbvRes.status === 'rejected',
      contribution: contributionRes.status === 'rejected', funnel: funnelRes.status === 'rejected',
      search: searchRes.status === 'rejected', products: productsRes.status === 'rejected',
      proposals: proposalsRes.status === 'rejected', checkout: checkoutRes.status === 'rejected',
      payments: paymentsRes.status === 'rejected', fulfillment: fulfillmentRes.status === 'rejected',
      recovery: recoveryRes.status === 'rejected', leadQuality: leadQualityRes.status === 'rejected',
      staff: staffRes.status === 'rejected', jadeTools: jadeToolsRes.status === 'rejected',
      dataHealth: dataHealthRes.status === 'rejected',
    }

    jadeAnalytics = {
      enabled:  true,
      range:    { from: jadeRange.from.toISOString(),     to: jadeRange.to.toISOString(),     label: jadeRange.label },
      previous: { from: jadePrevRange.from.toISOString(), to: jadePrevRange.to.toISOString() },
      executive:    executive   ? { current: executive,  previous: execPrev  } : null,
      gbv,
      contribution,
      funnel,
      dropoffs,
      search,
      products,
      proposals,
      checkout,
      payments,
      fulfillment,
      recovery:     recovery4e,
      leadQuality,
      staff,
      jadeTools,
      dataHealth,
      summary:  { bookingTrend, largestDropoff, pendingConfirmation },
      sectionErrors,
      generatedAt:       new Date().toISOString(),
      reportingTimezone: REPORTING_TIMEZONE,
      knownLimitations: [
        'Funnel stages 1–2 (Conversations, Searches) show all Jade tool interactions — not filtered to Jade-attributed leads.',
        'Funnel is a snapshot (events/records in this range), not a cohort. A booking confirmed this period may have started last period.',
        'No sandbox/test filtering is applied to behavioral data (CommercialEvent). Financial GBV (Trip/TripItem) also has no automated sandbox exclusion — exclude test trips via manual data hygiene.',
        'Previous period comparison shifts the window back by the same duration — not calendar-month-aligned.',
        'Staff and data health sections are management-only and absent for non-management sessions.',
        'Partially Confirmed GBV shows total TripItem costs for the trip — not just the confirmed items within it.',
      ],
    }
  }

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
      ...jadeAnalytics,
    },

    // Payment provider breakdown — from CommercialEvent metadata (post-Release 1.1 data only)
    // GBV buckets (above) remain the financial source of truth; this is analytics supplemental data.
    paymentsByProvider: paymentsByProviderRaw ?? [],
    paymentProviderNote: 'Event-based counts from Release 1.1 onward only. Pre-1.1 payments not included.',

    // Recovery analytics (Release 3D)
    recovery: {
      openValueByCurrency,
      recoveredGbv,
      recoveryRate,
      recoveredCount,
      lostCount,
      closedTotal,
      byType,
      staffPerformance: isManagement ? staffPerformance : undefined,
      denominatorNote: 'Rate = recovered ÷ (recovered + lost) for opportunities detected in this window. Open/dismissed excluded.',
    },
  })
}
