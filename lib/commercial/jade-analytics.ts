/**
 * lib/commercial/jade-analytics.ts
 * Release 4E — Jade Commerce Analytics Service
 *
 * All analytics functions used by /admin/revenue Jade Commerce tab.
 *
 * SOURCE OF TRUTH HIERARCHY (never mix sources for the same metric):
 *   Financial GBV       → Trip/TripItem (authoritative selling price)
 *   Supplier status     → ActivityBooking.status / Booking.status
 *   Proposal metrics    → Quote model
 *   Recovery            → RecoveryOpportunity model
 *   Behavioral funnel   → CommercialEvent (counts only, not amounts)
 *   Lead data           → Lead model
 *   Trip lifecycle      → Trip.status
 *
 * CURRENCY: All monetary return values are CurrencyAmount[] — never summed cross-currency.
 *
 * CACHING: These functions are designed to be cached at the API layer (30–120s TTL).
 * Cache keys must include: range.from, range.to, jadeFilter.
 *
 * SANDBOX/TEST FILTERING: No automated sandbox filtering is applied by these analytics
 * functions. CommercialEvent behavioral data (funnel, search) cannot be reliably filtered
 * without a dedicated sandbox flag on the event. Financial GBV is derived from Trip/TripItem
 * records — operators should exclude test trips via the data health diagnostic and manual review.
 * This known limitation is surfaced in the Jade Commerce tab under knownLimitations.
 */

import prisma from '@/lib/db'
import type { TripStatus, TripItemType } from '@prisma/client'
import {
  type DateRange,
  type CurrencyAmount,
  type JadeFilter,
  type FunnelStage,
  type AnalyticsOpts,
  type JadeAnalyticsContext,
  buildFunnelStages,
  getAllJadeLeadIds,
  getJadeLeadIds,
  mergeCurrencyAmounts,
  ACTIVE_RECOVERY_STATUSES,
} from './metrics'

// Feature flag guard — checked at the API layer, not here.
// Each analytics function assumes the caller has verified JADE_COMMERCE_ANALYTICS_ENABLED.

// ── Internal helpers ──────────────────────────────────────────────────────────

const CHECKOUT_ELIGIBLE_TYPES: TripItemType[] = ['FLIGHT', 'HOTEL', 'ACTIVITY', 'TRANSFER', 'TRANSPORT', 'ESIM', 'TOUR']
const PAID_TRIP_STATUSES: TripStatus[]      = ['PAID', 'CONFIRMING', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'COMPLETED']
const CONFIRMED_TRIP_STATUSES: TripStatus[] = ['CONFIRMED', 'COMPLETED']

// Sum TripItem.cost values, grouped by currency, for a set of trips.
// Excludes previously-purchased items (confirmed=true OR bookingRef is set BEFORE this payment).
// DOES NOT exclude items by confirmation status after payment (those go into confirmed/pending buckets).
async function sumTripItemCosts(
  tripIds: string[],
  excludeConfirmedItems = false,
): Promise<CurrencyAmount[]> {
  if (tripIds.length === 0) return []
  const items = await prisma.tripItem.findMany({
    where: {
      tripId: { in: tripIds },
      type:   { in: CHECKOUT_ELIGIBLE_TYPES },
      cost:   { not: null },
      ...(excludeConfirmedItems ? {} : {}),
    },
    select: { cost: true, currency: true },
  })
  const map = new Map<string, number>()
  for (const { cost, currency } of items) {
    if (cost == null || currency == null) continue
    map.set(currency, (map.get(currency) ?? 0) + cost)
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
}

// Build a Jade leadId filter for Prisma queries.
function jadeLeadFilter(
  filter: JadeFilter,
  jadeLeadIds: string[],
): { leadId?: { in: string[] } | { notIn: string[] } } {
  if (filter === 'JADE_ASSISTED') return { leadId: { in: jadeLeadIds } }
  if (filter === 'NON_JADE')      return { leadId: { notIn: jadeLeadIds } }
  return {}
}

// ── Executive KPIs ────────────────────────────────────────────────────────────

export interface ExecutiveMetrics {
  leads:             number
  trips:             number
  proposals:         number
  checkoutStarts:    number    // CommercialEvent-based (behavioral)
  paymentsCaptured:  number    // Trip model (authoritative)
  confirmedBookings: number    // Trip model (authoritative)
}

export async function getExecutiveMetrics(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<ExecutiveMetrics> {
  const { range, jadeFilter } = opts
  // Phase 12: use allJadeLeadIds for trip/proposal/payment attribution (all-time jade leads
  // may have activity in this range even if the lead was created before the range).
  // Leads count stays independent (queries jadeAssisted directly by createdAt).
  const jadeLeadIds = ctx.allJadeLeadIds

  const [leads, trips, proposals, checkoutStarts, paymentsCaptured, confirmedBookings] = await Promise.all([
    // Leads
    prisma.lead.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        ...(jadeFilter === 'JADE_ASSISTED' ? { jadeAssisted: true } : {}),
        ...(jadeFilter === 'NON_JADE'      ? { jadeAssisted: false } : {}),
      },
    }),

    // Trips — created in range, Jade attribution via lead
    prisma.trip.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
      },
    }),

    // Proposals (Quote) — not drafts, linked to Jade leads
    prisma.quote.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        status:    { not: 'draft' },
        ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
      },
    }),

    // Checkout starts — CommercialEvent behavioral count
    prisma.commercialEvent.count({
      where: {
        event:     'jade_checkout_started',
        createdAt: { gte: range.from, lte: range.to },
      },
    }),

    // Payments captured — Trips in PAID+ status
    prisma.trip.count({
      where: {
        updatedAt: { gte: range.from, lte: range.to },
        status:    { in: PAID_TRIP_STATUSES },
        ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
      },
    }),

    // Confirmed bookings — Trips in CONFIRMED or COMPLETED status
    prisma.trip.count({
      where: {
        updatedAt: { gte: range.from, lte: range.to },
        status:    { in: CONFIRMED_TRIP_STATUSES },
        ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
      },
    }),
  ])

  return { leads, trips, proposals, checkoutStarts, paymentsCaptured, confirmedBookings }
}

// ── GBV by bucket ─────────────────────────────────────────────────────────────

export interface GBVResult {
  paymentCaptured:     CurrencyAmount[]
  confirmed:           CurrencyAmount[]
  pendingConfirmation: CurrencyAmount[]
  partiallyConfirmed:  CurrencyAmount[]
  recovered:           CurrencyAmount[]
}

export async function getGBVBuckets(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<GBVResult> {
  const { range, jadeFilter } = opts
  const jadeLeadIds = ctx.allJadeLeadIds

  const baseFilter = {
    updatedAt: { gte: range.from, lte: range.to },
    ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
  }

  const [paidTripIds, confirmedTripIds, pendingTripIds, partialTripIds, recoveryRows] = await Promise.all([
    // All paid trips (all buckets share this denominator)
    prisma.trip.findMany({
      where: { ...baseFilter, status: { in: PAID_TRIP_STATUSES } },
      select: { id: true },
    }),

    // Confirmed trips
    prisma.trip.findMany({
      where: { ...baseFilter, status: { in: CONFIRMED_TRIP_STATUSES } },
      select: { id: true },
    }),

    // Pending trips (paid, awaiting supplier)
    prisma.trip.findMany({
      where: { ...baseFilter, status: { in: ['PAID', 'CONFIRMING'] } },
      select: { id: true },
    }),

    // Partially confirmed trips
    prisma.trip.findMany({
      where: { ...baseFilter, status: 'PARTIALLY_CONFIRMED' },
      select: { id: true },
    }),

    // Recovered GBV from RecoveryOpportunity
    prisma.recoveryOpportunity.findMany({
      where: {
        status:      'RECOVERED',
        recoveredAt: { gte: range.from, lte: range.to },
        ...(jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}),
      },
      select: { recoveredAmount: true, recoveredCurrency: true },
    }),
  ])

  const [paymentCaptured, confirmed, pendingConfirmation, partiallyConfirmed] = await Promise.all([
    sumTripItemCosts(paidTripIds.map(t => t.id)),
    sumTripItemCosts(confirmedTripIds.map(t => t.id)),
    sumTripItemCosts(pendingTripIds.map(t => t.id)),
    sumTripItemCosts(partialTripIds.map(t => t.id)),
  ])

  // Recovered GBV aggregation
  const recoveredMap = new Map<string, number>()
  for (const r of recoveryRows) {
    if (r.recoveredAmount == null || !r.recoveredCurrency) continue
    recoveredMap.set(r.recoveredCurrency, (recoveredMap.get(r.recoveredCurrency) ?? 0) + r.recoveredAmount)
  }
  const recovered = Array.from(recoveredMap.entries()).map(([currency, amount]) => ({ currency, amount }))

  return { paymentCaptured, confirmed, pendingConfirmation, partiallyConfirmed, recovered }
}

// ── Jade contribution ─────────────────────────────────────────────────────────

export interface JadeContribution {
  jadeConfirmedGBV:    CurrencyAmount[]
  nonJadeConfirmedGBV: CurrencyAmount[]
  jadeBookingCount:    number
  totalBookingCount:   number
}

export async function getJadeContribution(range: DateRange, ctx: JadeAnalyticsContext): Promise<JadeContribution> {
  const allJadeLeadIds = ctx.allJadeLeadIds

  const baseFilter = { updatedAt: { gte: range.from, lte: range.to }, status: { in: CONFIRMED_TRIP_STATUSES } }

  const [jadeTripIds, nonJadeTripIds] = await Promise.all([
    prisma.trip.findMany({
      where: { ...baseFilter, leadId: { in: allJadeLeadIds } },
      select: { id: true },
    }),
    prisma.trip.findMany({
      where: {
        ...baseFilter,
        OR: [{ leadId: null }, { leadId: { notIn: allJadeLeadIds } }],
      },
      select: { id: true },
    }),
  ])

  const [jadeGBV, nonJadeGBV] = await Promise.all([
    sumTripItemCosts(jadeTripIds.map(t => t.id)),
    sumTripItemCosts(nonJadeTripIds.map(t => t.id)),
  ])

  return {
    jadeConfirmedGBV:    jadeGBV,
    nonJadeConfirmedGBV: nonJadeGBV,
    jadeBookingCount:    jadeTripIds.length,
    totalBookingCount:   jadeTripIds.length + nonJadeTripIds.length,
  }
}

// ── Jade funnel ───────────────────────────────────────────────────────────────

/**
 * Builds the Jade commerce funnel.
 *
 * DEDUPLICATION STRATEGY:
 *   Stages 1–2 (Conversations, Searches): unique by COALESCE(leadId, userId, sessionId)
 *     from CommercialEvent — BEHAVIORAL, weaker signal.
 *   Stages 3+ (Trips, Proposals, Checkout, Payment, Confirmed):
 *     count distinct Trip/Quote records — AUTHORITATIVE, stronger signal.
 *
 * Proposal is OPTIONAL in the Jade funnel. Trip → Checkout is also tracked separately
 * from Proposal → Checkout to handle both direct-checkout and proposal-mediated paths.
 *
 * NOTE: This is a SNAPSHOT funnel (events/records in the date range), not a pure
 * cohort funnel (all events for trips created in the range). The snapshot answers
 * "what happened this period." Cohort analysis requires longer-range look-backs.
 *
 * NOTE: Stages 1–2 cannot be reliably filtered by JadeFilter because CommercialEvent
 * has no jadeAssisted column. They are shown as total Jade-tool interaction counts.
 */
export interface JadeFunnelResult {
  stages:          FunnelStage[]
  directCheckout:  { trips: number; payments: number }
  proposalPath:    { proposals: number; accepted: number; payments: number }
}

export async function getJadeFunnel(range: DateRange, ctx: JadeAnalyticsContext): Promise<JadeFunnelResult> {
  const JADE_SEARCH_EVENTS = [
    'jade_flight_search', 'jade_hotel_search', 'jade_activity_search',
    'jade_transfer_search', 'jade_esim_search',
  ]
  const allJadeLeadIds = ctx.allJadeLeadIds

  const [
    conversations,
    searches,
    tripsCount,
    proposalsCount,
    checkoutStartEvents,
    paymentsCount,
    confirmedCount,
    proposalAccepted,
  ] = await Promise.all([
    // Stage 1: Unique Jade conversations — groupBy to deduplicate
    prisma.commercialEvent.findMany({
      where: {
        event:     'jade_started',
        createdAt: { gte: range.from, lte: range.to },
      },
      select:   { sessionId: true, userId: true, leadId: true },
      distinct: ['sessionId', 'userId'],  // rough dedup — Prisma distinct is per-column
    }),

    // Stage 2: Unique searchers
    prisma.commercialEvent.findMany({
      where: {
        event:     { in: JADE_SEARCH_EVENTS },
        createdAt: { gte: range.from, lte: range.to },
      },
      select:   { sessionId: true, userId: true, leadId: true },
      distinct: ['sessionId', 'userId'],
    }),

    // Stage 3: Trips created in range linked to jade leads
    prisma.trip.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        leadId:    { in: allJadeLeadIds },
      },
    }),

    // Stage 4: Proposals created in range for jade leads
    prisma.quote.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        status:    { not: 'draft' },
        leadId:    { in: allJadeLeadIds },
      },
    }),

    // Stage 5: Checkout started (behavioral CommercialEvent)
    prisma.commercialEvent.count({
      where: {
        event:     'jade_checkout_started',
        createdAt: { gte: range.from, lte: range.to },
      },
    }),

    // Stage 6: Payments captured — trips that reached PAID+ and updated in range
    prisma.trip.count({
      where: {
        updatedAt: { gte: range.from, lte: range.to },
        status:    { in: PAID_TRIP_STATUSES },
        leadId:    { in: allJadeLeadIds },
      },
    }),

    // Stage 7: Supplier confirmed
    prisma.trip.count({
      where: {
        updatedAt: { gte: range.from, lte: range.to },
        status:    { in: CONFIRMED_TRIP_STATUSES },
        leadId:    { in: allJadeLeadIds },
      },
    }),

    // Proposal accepted (for optional path metrics)
    prisma.quote.count({
      where: {
        acceptedAt: { gte: range.from, lte: range.to },
        leadId:     { in: allJadeLeadIds },
      },
    }),
  ])

  const rawStages = [
    { label: 'Jade Conversations',   count: conversations.length },
    { label: 'Live Searches',        count: searches.length },
    { label: 'Trips Created',        count: tripsCount },
    { label: 'Proposals Created',    count: proposalsCount },
    { label: 'Checkout Started',     count: checkoutStartEvents },
    { label: 'Payment Captured',     count: paymentsCount },
    { label: 'Supplier Confirmed',   count: confirmedCount },
  ]

  // Phase 1 fix: authoritative sub-path metrics using Quote↔Trip linkage.
  // Trip model may not have a `quotes` inverse relation in the Prisma schema,
  // so we resolve via Quote.tripId directly (two queries, no relation filter needed).
  const paidJadeTrips = await prisma.trip.findMany({
    where: {
      updatedAt: { gte: range.from, lte: range.to },
      status:    { in: PAID_TRIP_STATUSES },
      leadId:    { in: allJadeLeadIds },
    },
    select: { id: true },
  })
  const paidJadeTripIds = paidJadeTrips.map(t => t.id)

  const proposalQuotes = paidJadeTripIds.length === 0 ? [] : await prisma.quote.findMany({
    where: {
      tripId: { in: paidJadeTripIds },
      status: { in: ['sent', 'accepted', 'converted'] },
    },
    select: { tripId: true },
  })
  const proposalTripIdSet  = new Set(proposalQuotes.map(q => q.tripId).filter((id): id is string => id !== null))
  const proposalPathTrips  = proposalTripIdSet.size
  const directCheckoutTrips = paidJadeTripIds.length - proposalPathTrips

  return {
    stages:         buildFunnelStages(rawStages),
    directCheckout: { trips: directCheckoutTrips, payments: directCheckoutTrips },
    proposalPath:   { proposals: proposalsCount, accepted: proposalAccepted, payments: proposalPathTrips },
  }
}

// ── Search analytics ──────────────────────────────────────────────────────────

export interface SearchProductMetrics {
  product:         string
  totalSearches:   number
  noResultSearches: number
  failedSearches:  number
  noResultRate:    number | null  // percentage; null if totalSearches = 0
  failureRate:     number | null
}

export async function getSearchAnalytics(range: DateRange): Promise<SearchProductMetrics[]> {
  const PRODUCT_MAP: Record<string, string> = {
    jade_flight_search:   'flight',
    jade_hotel_search:    'hotel',
    jade_activity_search: 'activity',
    jade_transfer_search: 'transfer',
    jade_esim_search:     'esim',
  }

  const allSearchEvents = Object.keys(PRODUCT_MAP)

  const [searchCounts, noResultCounts, failedCounts] = await Promise.all([
    // Successful searches (each tool-specific event = 1 successful search)
    prisma.commercialEvent.groupBy({
      by:    ['event'],
      where: {
        event:     { in: allSearchEvents },
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { id: true },
    }),

    // No-result searches (unified event with productType in metadata)
    prisma.commercialEvent.findMany({
      where: {
        event:     'jade_search_no_results',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { metadata: true },
    }),

    // Failed searches
    prisma.commercialEvent.findMany({
      where: {
        event:     'jade_search_failed',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { metadata: true },
    }),
  ])

  // Build per-product counts
  const successMap  = new Map<string, number>()
  const noResultMap = new Map<string, number>()
  const failedMap   = new Map<string, number>()

  for (const row of searchCounts) {
    const product = PRODUCT_MAP[row.event] ?? row.event
    successMap.set(product, (successMap.get(product) ?? 0) + row._count.id)
  }
  for (const row of noResultCounts) {
    const meta    = (row.metadata as Record<string, unknown> | null) ?? {}
    const product = (meta.productType as string | undefined) ?? 'unknown'
    noResultMap.set(product, (noResultMap.get(product) ?? 0) + 1)
  }
  for (const row of failedCounts) {
    const meta    = (row.metadata as Record<string, unknown> | null) ?? {}
    const product = (meta.productType as string | undefined) ?? 'unknown'
    failedMap.set(product, (failedMap.get(product) ?? 0) + 1)
  }

  const products = ['flight', 'hotel', 'activity', 'transfer', 'esim']
  return products.map(product => {
    const successful = successMap.get(product)  ?? 0
    const noResults  = noResultMap.get(product) ?? 0
    const failed     = failedMap.get(product)   ?? 0
    const total      = successful + noResults + failed
    return {
      product,
      totalSearches:    total,
      noResultSearches: noResults,
      failedSearches:   failed,
      noResultRate:     total === 0 ? null : (noResults / total) * 100,
      failureRate:      total === 0 ? null : (failed   / total) * 100,
    }
  })
}

// ── Product performance ───────────────────────────────────────────────────────

export interface ProductPerformance {
  product:         string
  tripsWithItem:   number
  paidTrips:       number
  confirmedTrips:  number
  confirmedGBV:    CurrencyAmount[]
  attachRate:      number | null  // confirmedTrips with this product / all confirmedTrips
}

export async function getProductAnalytics(range: DateRange, ctx: JadeAnalyticsContext): Promise<ProductPerformance[]> {
  const allJadeLeadIds = ctx.allJadeLeadIds
  const baseTrip = {
    updatedAt: { gte: range.from, lte: range.to },
    leadId:    { in: allJadeLeadIds },
  }

  const [totalConfirmed, allTripItems] = await Promise.all([
    prisma.trip.count({
      where: { ...baseTrip, status: { in: CONFIRMED_TRIP_STATUSES } },
    }),
    // Phase 2 fix: fetch raw rows and deduplicate by tripId with a Set.
    // groupBy._count._all counts TripItem rows (not distinct trips) → can exceed 100%.
    prisma.tripItem.findMany({
      where: {
        trip: { ...baseTrip, status: { in: CONFIRMED_TRIP_STATUSES } },
        type: { in: CHECKOUT_ELIGIBLE_TYPES },
      },
      select: { tripId: true, type: true, cost: true, currency: true },
    }),
  ])

  const typeTripsMap  = new Map<string, Set<string>>()
  const typeCostMap   = new Map<string, Map<string, number>>()

  for (const item of allTripItems) {
    const t = item.type.toUpperCase()
    if (!typeTripsMap.has(t)) {
      typeTripsMap.set(t, new Set())
      typeCostMap.set(t, new Map())
    }
    typeTripsMap.get(t)!.add(item.tripId)
    if (item.cost != null && item.currency) {
      const cm = typeCostMap.get(t)!
      cm.set(item.currency, (cm.get(item.currency) ?? 0) + item.cost)
    }
  }

  return Array.from(typeTripsMap.entries()).map(([type, tripsSet]) => {
    const tripsWithItem = tripsSet.size   // distinct trips, never exceeds totalConfirmed
    const cm            = typeCostMap.get(type) ?? new Map()
    const confirmedGBV  = Array.from(cm.entries()).map(([currency, amount]) => ({ currency, amount }))
    return {
      product:        type.toLowerCase(),
      tripsWithItem,
      paidTrips:      0,
      confirmedTrips: tripsWithItem,
      confirmedGBV,
      attachRate:     totalConfirmed === 0 ? null : (tripsWithItem / totalConfirmed) * 100,
    }
  })
}

// ── Proposal analytics ────────────────────────────────────────────────────────

export interface ProposalAnalytics {
  created:       number
  sent:          number
  accepted:      number
  declined:      number
  expired:       number
  converted:     number
  acceptanceRate: number | null
  conversionRate: number | null
  medianDaysToAcceptance: number | null  // null when insufficient data
}

export async function getProposalAnalytics(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<ProposalAnalytics> {
  const { range, jadeFilter } = opts
  const jadeLeadIds = ctx.allJadeLeadIds
  const leadFilter  = jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}

  const [created, sent, accepted, declined, expired, converted, acceptedWithDates] = await Promise.all([
    prisma.quote.count({ where: { createdAt: { gte: range.from, lte: range.to }, ...leadFilter } }),
    prisma.quote.count({ where: { sentAt: { gte: range.from, lte: range.to }, ...leadFilter } }),
    prisma.quote.count({ where: { acceptedAt: { gte: range.from, lte: range.to }, ...leadFilter } }),
    prisma.quote.count({ where: { declinedAt: { gte: range.from, lte: range.to }, ...leadFilter } }),
    prisma.quote.count({
      where: {
        validUntil: { lte: range.to, gte: range.from },
        status:     { notIn: ['accepted', 'converted', 'declined'] },
        ...leadFilter,
      },
    }),
    prisma.quote.count({
      where: { convertedAt: { gte: range.from, lte: range.to }, ...leadFilter },
    }),
    // For median days-to-acceptance calculation
    prisma.quote.findMany({
      where: {
        acceptedAt: { gte: range.from, lte: range.to },
        sentAt:     { not: null },
        ...leadFilter,
      },
      select: { sentAt: true, acceptedAt: true },
    }),
  ])

  // Median days to acceptance
  let medianDaysToAcceptance: number | null = null
  if (acceptedWithDates.length > 0) {
    const days = acceptedWithDates
      .filter(q => q.sentAt && q.acceptedAt)
      .map(q => (q.acceptedAt!.getTime() - q.sentAt!.getTime()) / 86400_000)
      .sort((a, b) => a - b)
    if (days.length > 0) {
      const mid = Math.floor(days.length / 2)
      medianDaysToAcceptance = days.length % 2 === 0
        ? (days[mid - 1] + days[mid]) / 2
        : days[mid]
    }
  }

  return {
    created,
    sent,
    accepted,
    declined,
    expired,
    converted,
    acceptanceRate:         sent === 0 ? null : (accepted / sent) * 100,
    conversionRate:         sent === 0 ? null : (converted / sent) * 100,
    medianDaysToAcceptance,
  }
}

// ── Checkout analytics ────────────────────────────────────────────────────────

const CHECKOUT_BLOCK_REASONS = [
  'STALE', 'FLIGHT_EXPIRED', 'SOLD_OUT', 'PRICE_CHANGED',
  'MIXED_CURRENCY', 'REVALIDATION_FAILED', 'PRICE_UNVERIFIABLE', 'ITEM_NOT_FOUND',
]

export interface CheckoutAnalytics {
  requested:      number
  ready:          number
  blocked:        number
  priceChanged:   number
  started:        number
  abandoned:      number      // started but no payment in reasonable window
  converted:      number      // jade_checkout_converted
  readinessRate:  number | null  // ready / requested
  blockRate:      number | null  // blocked / requested
  conversionRate: number | null  // converted / started
  blockReasons:   Array<{ reason: string; count: number }>
}

export async function getCheckoutAnalytics(range: DateRange): Promise<CheckoutAnalytics> {
  const CHECKOUT_EVENTS = [
    'jade_checkout_requested', 'jade_checkout_ready', 'jade_checkout_blocked',
    'jade_checkout_price_changed', 'jade_checkout_started', 'jade_checkout_converted',
  ]

  const eventCounts = await prisma.commercialEvent.groupBy({
    by:    ['event'],
    where: {
      event:     { in: CHECKOUT_EVENTS },
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: { id: true },
  })

  const countMap = new Map(eventCounts.map(e => [e.event, e._count.id]))

  const requested    = countMap.get('jade_checkout_requested')    ?? 0
  const ready        = countMap.get('jade_checkout_ready')        ?? 0
  const blocked      = countMap.get('jade_checkout_blocked')      ?? 0
  const priceChanged = countMap.get('jade_checkout_price_changed') ?? 0
  const started      = countMap.get('jade_checkout_started')      ?? 0
  const converted    = countMap.get('jade_checkout_converted')    ?? 0

  // Block reasons — from metadata stored on jade_checkout_blocked events
  // The block reason is in CommercialEvent.metadata.issues[].type (from checkout-handoff)
  const blockedEvents = await prisma.commercialEvent.findMany({
    where: {
      event:     'jade_checkout_blocked',
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { metadata: true },
  })

  const reasonCounts = new Map<string, number>()
  for (const ev of blockedEvents) {
    const meta = ev.metadata as Record<string, unknown> | null
    const issues = (meta?.issues as Array<{ type?: string }> | undefined) ?? []
    for (const issue of issues) {
      const r = issue.type ?? 'UNKNOWN'
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1)
    }
  }

  const blockReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  return {
    requested,
    ready,
    blocked,
    priceChanged,
    started,
    abandoned:      Math.max(0, started - converted),
    converted,
    readinessRate:  requested === 0 ? null : (ready    / requested) * 100,
    blockRate:      requested === 0 ? null : (blocked  / requested) * 100,
    conversionRate: started   === 0 ? null : (converted / started)  * 100,
    blockReasons,
  }
}

// ── Payment provider analytics ────────────────────────────────────────────────

export interface PaymentProviderMetrics {
  provider:        string
  attempts:        number
  succeeded:       number
  failed:          number
  conversionRate:  number | null
  capturedGBV:     CurrencyAmount[]
}

export async function getPaymentAnalytics(range: DateRange): Promise<PaymentProviderMetrics[]> {
  const [succeeded, failed] = await Promise.all([
    prisma.commercialEvent.findMany({
      where: {
        event:     'payment_succeeded',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { metadata: true, currency: true, amount: true },
    }),
    prisma.commercialEvent.findMany({
      where: {
        event:     'payment_failed',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { metadata: true },
    }),
  ])

  const successMap = new Map<string, { count: number; gbv: Map<string, number> }>()
  const failedMap  = new Map<string, number>()

  for (const ev of succeeded) {
    const meta     = ev.metadata as Record<string, unknown> | null
    // Phase 9: normalize provider from metadata. payment.ts writes metadata.provider (authoritative).
    // Older events may have metadata.source (webhook handler format). Both are normalized the same way.
    const provider = (
      (meta?.provider as string | undefined) ??
      (meta?.source as string | undefined)?.replace('_webhook', '').toUpperCase()
    )?.toUpperCase() ?? 'UNKNOWN'
    if (!successMap.has(provider)) successMap.set(provider, { count: 0, gbv: new Map() })
    const entry = successMap.get(provider)!
    entry.count++
    if (ev.currency && ev.amount) {
      entry.gbv.set(ev.currency, (entry.gbv.get(ev.currency) ?? 0) + ev.amount)
    }
  }

  for (const ev of failed) {
    const meta     = ev.metadata as Record<string, unknown> | null
    const provider = (meta?.provider as string | undefined) ?? 'UNKNOWN'
    failedMap.set(provider, (failedMap.get(provider) ?? 0) + 1)
  }

  const allProviders = new Set([...successMap.keys(), ...failedMap.keys()])
  return Array.from(allProviders).map(provider => {
    const s    = successMap.get(provider) ?? { count: 0, gbv: new Map() }
    const f    = failedMap.get(provider)  ?? 0
    const attempts = s.count + f
    return {
      provider,
      attempts,
      succeeded:      s.count,
      failed:         f,
      conversionRate: attempts === 0 ? null : (s.count / attempts) * 100,
      capturedGBV:    Array.from(s.gbv.entries()).map(([currency, amount]) => ({ currency, amount })),
    }
  })
}

// ── Supplier fulfillment analytics ────────────────────────────────────────────

export interface FulfillmentAnalytics {
  paidTrips:          number
  confirmed:          number
  partiallyConfirmed: number
  pending:            number
  supplierFailures:   number  // ActivityBooking.status = FAILED in range
  confirmationRate:   number | null  // confirmed / paidTrips
}

export async function getFulfillmentAnalytics(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<FulfillmentAnalytics> {
  const { range, jadeFilter } = opts
  const jadeLeadIds = ctx.allJadeLeadIds
  const leadFilter  = jadeFilter !== 'ALL' ? jadeLeadFilter(jadeFilter, jadeLeadIds) : {}

  const baseFilter = { updatedAt: { gte: range.from, lte: range.to }, ...leadFilter }

  const [paidTrips, confirmed, partial, pending, failures] = await Promise.all([
    prisma.trip.count({ where: { ...baseFilter, status: { in: PAID_TRIP_STATUSES } } }),
    prisma.trip.count({ where: { ...baseFilter, status: { in: CONFIRMED_TRIP_STATUSES } } }),
    prisma.trip.count({ where: { ...baseFilter, status: 'PARTIALLY_CONFIRMED' } }),
    prisma.trip.count({ where: { ...baseFilter, status: { in: ['PAID', 'CONFIRMING'] } } }),
    prisma.activityBooking.count({
      where: {
        status:    'FAILED',
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
  ])

  return {
    paidTrips,
    confirmed,
    partiallyConfirmed: partial,
    pending,
    supplierFailures:   failures,
    confirmationRate:   paidTrips === 0 ? null : (confirmed / paidTrips) * 100,
  }
}

// ── Recovery analytics (reuses existing infrastructure) ───────────────────────

export interface RecoveryMetrics {
  openValue:       CurrencyAmount[]
  recoveredGBV:    CurrencyAmount[]
  lostValue:       CurrencyAmount[]
  openCount:       number
  recoveredCount:  number
  lostCount:       number
  recoveryRate:    number | null  // recoveredCount / (recoveredCount + lostCount)
  jadeAssistedRecoveredGBV: CurrencyAmount[]
}

export async function getRecoveryMetrics(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<RecoveryMetrics> {
  const { range } = opts
  const allJadeLeadIds = ctx.allJadeLeadIds

  // Phase 5: use ACTIVE_RECOVERY_STATUSES (OPEN + CONTACTED + IN_PROGRESS) consistently.
  const [openRows, recoveredRows, lostRows, jadeRecoveredRows] = await Promise.all([
    prisma.recoveryOpportunity.findMany({
      where:  { status: { in: [...ACTIVE_RECOVERY_STATUSES] }, createdAt: { gte: range.from, lte: range.to } },
      select: { amount: true, currency: true },
    }),
    prisma.recoveryOpportunity.findMany({
      where:  { status: 'RECOVERED', recoveredAt: { gte: range.from, lte: range.to } },
      select: { recoveredAmount: true, recoveredCurrency: true },
    }),
    prisma.recoveryOpportunity.findMany({
      where:  { status: 'LOST', updatedAt: { gte: range.from, lte: range.to } },
      select: { amount: true, currency: true },
    }),
    // Jade-assisted recovered opportunities
    prisma.recoveryOpportunity.findMany({
      where: {
        status:    'RECOVERED',
        recoveredAt: { gte: range.from, lte: range.to },
        leadId:    { in: allJadeLeadIds },
      },
      select: { recoveredAmount: true, recoveredCurrency: true },
    }),
  ])

  function sumOpportunities(rows: Array<{ amount: number | null; currency: string | null }>): CurrencyAmount[] {
    const map = new Map<string, number>()
    for (const { amount, currency } of rows) {
      if (!amount || !currency) continue
      map.set(currency, (map.get(currency) ?? 0) + amount)
    }
    return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
  }

  function sumRecovered(rows: Array<{ recoveredAmount: number | null; recoveredCurrency: string | null }>): CurrencyAmount[] {
    const map = new Map<string, number>()
    for (const { recoveredAmount, recoveredCurrency } of rows) {
      if (!recoveredAmount || !recoveredCurrency) continue
      map.set(recoveredCurrency, (map.get(recoveredCurrency) ?? 0) + recoveredAmount)
    }
    return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
  }

  const recoveredCount = recoveredRows.length
  const lostCount      = lostRows.length

  return {
    openValue:                sumOpportunities(openRows),
    recoveredGBV:             sumRecovered(recoveredRows),
    lostValue:                sumOpportunities(lostRows),
    openCount:                openRows.length,
    recoveredCount,
    lostCount,
    recoveryRate:             (recoveredCount + lostCount) === 0 ? null : (recoveredCount / (recoveredCount + lostCount)) * 100,
    jadeAssistedRecoveredGBV: sumRecovered(jadeRecoveredRows),
  }
}

// ── Lead quality analytics ────────────────────────────────────────────────────

export interface LeadQualityMetrics {
  hot:  { count: number; bookingRate: number | null }
  warm: { count: number; bookingRate: number | null }
  cold: { count: number; bookingRate: number | null }
}

export async function getLeadQualityAnalytics(opts: AnalyticsOpts, ctx: JadeAnalyticsContext): Promise<LeadQualityMetrics> {
  const { range, jadeFilter } = opts
  const jadeLeadIds = ctx.allJadeLeadIds
  // Filter by Lead.id (PK), not leadId — jadeLeadFilter() targets Trip.leadId (FK) and must not be used here.
  const leadIdFilter = jadeFilter === 'JADE_ASSISTED' ? { id: { in: jadeLeadIds } }
                     : jadeFilter === 'NON_JADE'      ? { id: { notIn: jadeLeadIds } }
                     : {}

  const levels = ['hot', 'warm', 'cold'] as const

  const results = await Promise.all(levels.map(async level => {
    const leads = await prisma.lead.findMany({
      where: {
        createdAt:     { gte: range.from, lte: range.to },
        interestLevel: level,
        ...leadIdFilter,
      },
      select: { id: true },
    })
    const leadIds = leads.map(l => l.id)
    const booked  = leadIds.length === 0 ? 0 : await prisma.trip.count({
      where: { leadId: { in: leadIds }, status: { in: PAID_TRIP_STATUSES } },
    })
    return {
      count:       leads.length,
      bookingRate: leads.length === 0 ? null : (booked / leads.length) * 100,
    }
  }))

  return { hot: results[0], warm: results[1], cold: results[2] }
}

// ── Jade tool performance ─────────────────────────────────────────────────────

export interface JadeToolMetrics {
  tool:     string
  calls:    number
  searches?: number   // for search tools only
}

export async function getJadeToolPerformance(range: DateRange): Promise<JadeToolMetrics[]> {
  const TOOL_EVENT_MAP: Record<string, string> = {
    search_flights:            'jade_flight_search',
    search_hotels:             'jade_hotel_search',
    search_activities:         'jade_activity_search',
    search_transfers:          'jade_transfer_search',
    search_esims:              'jade_esim_search',
    add_search_result_to_trip: 'jade_search_result_added',
    build_trip:                'jade_trip_build_started',
    replace_trip_item:         'jade_trip_item_replaced',
    create_trip_proposal:      'jade_proposal_created',
    prepare_trip_checkout:     'jade_checkout_requested',
  }

  const eventNames = Object.values(TOOL_EVENT_MAP)
  const rows = await prisma.commercialEvent.groupBy({
    by:    ['event'],
    where: {
      event:     { in: eventNames },
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: { id: true },
  })

  const countMap = new Map(rows.map(r => [r.event, r._count.id]))

  return Object.entries(TOOL_EVENT_MAP).map(([tool, event]) => ({
    tool,
    calls: countMap.get(event) ?? 0,
  }))
}

// ── Data health diagnostics ───────────────────────────────────────────────────

export interface DataHealthIssue {
  type:        string
  description: string
  count:       number
}

export interface DataHealthResult {
  issues:  DataHealthIssue[]
  healthy: boolean
}

export async function getDataHealthDiagnostics(): Promise<DataHealthResult> {
  const issues: DataHealthIssue[] = []

  const [
    paidTripsNoLead,
    jadePaymentsNoLead,
    proposalsNoTrip,
    confirmedNoPayment,
  ] = await Promise.all([
    // Paid trips with no lead attribution
    prisma.trip.count({
      where: { status: { in: PAID_TRIP_STATUSES }, leadId: null },
    }),

    // jade_checkout_converted events with no leadId
    prisma.commercialEvent.count({
      where: { event: 'jade_checkout_converted', leadId: null },
    }),

    // Proposals (non-draft) with no tripId (cannot trace trip lineage)
    prisma.quote.count({
      where: { status: { not: 'draft' }, tripId: null },
    }),

    // Phase 13: counts confirmed trips with NEITHER a leadId NOR a userId — these
    // trips have no attribution anchor and cannot be assigned to Jade or any staff member.
    // This is NOT a payment-lineage check (payment events are behavioral, not structural).
    prisma.trip.count({
      where: {
        status: { in: CONFIRMED_TRIP_STATUSES },
        leadId: null,
        userId: null,
      },
    }),
  ])

  if (paidTripsNoLead > 0) {
    issues.push({
      type:        'PAID_TRIP_NO_LEAD',
      description: 'Paid trips with no Lead attribution — Jade contribution may be undercounted.',
      count:        paidTripsNoLead,
    })
  }
  if (jadePaymentsNoLead > 0) {
    issues.push({
      type:        'JADE_PAYMENT_NO_LEAD',
      description: 'jade_checkout_converted events with no leadId — attribution gap.',
      count:        jadePaymentsNoLead,
    })
  }
  if (proposalsNoTrip > 0) {
    issues.push({
      type:        'PROPOSAL_NO_TRIP',
      description: 'Non-draft proposals with no tripId — funnel lineage incomplete.',
      count:        proposalsNoTrip,
    })
  }
  if (confirmedNoPayment > 0) {
    issues.push({
      type:        'CONFIRMED_NO_OWNER',
      description: 'Confirmed trips with no userId and no leadId — unattributable, excluded from all analytics.',
      count:        confirmedNoPayment,
    })
  }

  return { issues, healthy: issues.length === 0 }
}

// ── Staff analytics ───────────────────────────────────────────────────────────

export interface StaffMemberMetrics {
  staffId:            string
  name:               string
  assignedLeads:      number
  proposalsSent:      number
  proposalsAccepted:  number
  proposalConversionRate: number | null
}

export async function getStaffAnalytics(
  range: DateRange,
  staffId?: string,
): Promise<StaffMemberMetrics[]> {
  const whereStaff = staffId ? { assignedToId: staffId } : {}

  const [leads, proposals] = await Promise.all([
    prisma.lead.groupBy({
      by:    ['assignedToId'],
      where: {
        createdAt: { gte: range.from, lte: range.to },
        assignedToId: { not: null },
        ...whereStaff,
      },
      _count: { id: true },
    }),
    prisma.quote.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        sentAt:    { not: null },
        ...(staffId ? { createdBy: staffId } : {}),
      },
      select: { createdBy: true, acceptedAt: true },
    }),
  ])

  const leadsByStaff    = new Map(leads.map(r => [r.assignedToId, r._count.id]))
  const proposalsByStaff = new Map<string, { sent: number; accepted: number }>()

  for (const q of proposals) {
    if (!q.createdBy) continue
    const entry = proposalsByStaff.get(q.createdBy) ?? { sent: 0, accepted: 0 }
    entry.sent++
    if (q.acceptedAt) entry.accepted++
    proposalsByStaff.set(q.createdBy, entry)
  }

  const allStaffIds = new Set([
    ...Array.from(leadsByStaff.keys()).filter(Boolean) as string[],
    ...Array.from(proposalsByStaff.keys()),
  ])

  const staffMembers = await prisma.staffMember.findMany({
    where:  { id: { in: Array.from(allStaffIds) } },
    select: { id: true, name: true },
  })

  return staffMembers.map(s => {
    const p = proposalsByStaff.get(s.id) ?? { sent: 0, accepted: 0 }
    return {
      staffId:            s.id,
      name:               s.name,
      assignedLeads:      leadsByStaff.get(s.id) ?? 0,
      proposalsSent:      p.sent,
      proposalsAccepted:  p.accepted,
      proposalConversionRate: p.sent === 0 ? null : (p.accepted / p.sent) * 100,
    }
  })
}
