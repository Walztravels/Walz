/**
 * lib/commercial/metrics.ts
 * Release 4E — Jade Commerce Analytics & Revenue Intelligence
 *
 * Centralized commercial accounting definitions for Walz Travels.
 *
 * ACCOUNTING RULES:
 *   1. Never sum amounts across currencies. All GBV functions return CurrencyAmount[].
 *   2. Financial metrics derive from authoritative DB records — NOT CommercialEvent.amount.
 *   3. CommercialEvent is for BEHAVIORAL metrics (funnel, search volume) only.
 *   4. Payment captured ≠ confirmed. Never conflate these labels in UI.
 *   5. CommercialEvent.eventId uses @@index (not @@unique) — dedup is application-level.
 *
 * REPORTING TIMEZONE:
 *   Africa/Lagos (UTC+1, no DST). All date-range boundaries computed in Lagos time
 *   then converted to UTC for DB queries. Prisma DateTime stores UTC.
 *
 * JADE ATTRIBUTION:
 *   Primary signal: Lead.jadeAssisted = true.
 *   Do NOT rely on browser localStorage, URL params, or client-side state.
 *   Staff review/modification does not break Jade attribution.
 */

import prisma from '@/lib/db'

// ── Reporting timezone ────────────────────────────────────────────────────────

export const REPORTING_TIMEZONE = 'Africa/Lagos'  // UTC+1 year-round

// ── Date range ────────────────────────────────────────────────────────────────

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'

export interface DateRange {
  from:  Date    // start of range, UTC
  to:    Date    // end of range (inclusive), UTC
  label: string
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000  // UTC+1

function toLagos(d: Date): Date { return new Date(d.getTime() + LAGOS_OFFSET_MS) }
function fromLagos(d: Date): Date { return new Date(d.getTime() - LAGOS_OFFSET_MS) }

function startOfDayLagos(d: Date): Date {
  const lagos = toLagos(d)
  lagos.setUTCHours(0, 0, 0, 0)
  return fromLagos(lagos)
}

function endOfDayLagos(d: Date): Date {
  const lagos = toLagos(d)
  lagos.setUTCHours(23, 59, 59, 999)
  return fromLagos(lagos)
}

export function buildDateRange(
  preset: DateRangePreset | { from: string; to: string },
): DateRange {
  const now = new Date()

  if (typeof preset === 'object' && 'from' in preset) {
    return {
      from:  startOfDayLagos(new Date(preset.from)),
      to:    endOfDayLagos(new Date(preset.to)),
      label: 'Custom',
    }
  }

  switch (preset) {
    case 'today': {
      return { from: startOfDayLagos(now), to: endOfDayLagos(now), label: 'Today' }
    }
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      return { from: startOfDayLagos(d), to: endOfDayLagos(d), label: 'Yesterday' }
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: startOfDayLagos(d), to: endOfDayLagos(now), label: 'Last 7 days' }
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      return { from: startOfDayLagos(d), to: endOfDayLagos(now), label: 'Last 30 days' }
    }
    case 'this_month': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      return { from: startOfDayLagos(first), to: endOfDayLagos(now), label: 'This month' }
    }
    case 'last_month': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const last  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
      return { from: startOfDayLagos(first), to: endOfDayLagos(last), label: 'Last month' }
    }
  }
}

export function previousPeriod(range: DateRange): DateRange {
  const spanMs = range.to.getTime() - range.from.getTime() + 1
  return {
    from:  new Date(range.from.getTime() - spanMs),
    to:    new Date(range.from.getTime() - 1),
    label: `Previous period`,
  }
}

// ── Currency ──────────────────────────────────────────────────────────────────

export interface CurrencyAmount {
  currency: string
  amount:   number
}

// Merge two CurrencyAmount[] arrays, summing amounts per currency.
export function mergeCurrencyAmounts(a: CurrencyAmount[], b: CurrencyAmount[]): CurrencyAmount[] {
  const map = new Map<string, number>()
  for (const { currency, amount } of [...a, ...b]) {
    map.set(currency, (map.get(currency) ?? 0) + amount)
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }))
}

// ── Jade filter ───────────────────────────────────────────────────────────────

export type JadeFilter = 'ALL' | 'JADE_ASSISTED' | 'NON_JADE'

// ── GBV bucket definitions ────────────────────────────────────────────────────

/**
 * GBV (Gross Booking Value) accounting buckets.
 *
 * paymentCaptured     Money received from customers. Does NOT imply supplier confirmation.
 *                     Source: Trip.status ∈ {PAID, CONFIRMING, CONFIRMED, PARTIALLY_CONFIRMED, COMPLETED}
 *
 * confirmed           Payment captured AND supplier confirmation received.
 *                     Source: Trip.status ∈ {CONFIRMED, COMPLETED}
 *
 * pendingConfirmation Payment received; supplier confirmation still outstanding.
 *                     Source: Trip.status ∈ {PAID, CONFIRMING}
 *
 * partiallyConfirmed  Payment received; some but not all items confirmed.
 *                     Source: Trip.status = PARTIALLY_CONFIRMED
 *
 * failedAfterPayment  Payment received; supplier fulfillment failed or in reconciliation.
 *                     Source: ActivityBooking.status ∈ {FAILED, RECONCILIATION_REQUIRED}
 *                     attached to a paid Trip.
 *
 * recovered           Value rescued from a RecoveryOpportunity.
 *                     Source: RecoveryOpportunity.recoveredAmount where status = RECOVERED.
 *
 * proposalValue       Quote.totalMinor → NOT revenue. Bids, not receipts.
 *
 * checkoutValue       CartSession.totalAmount for sessions entering checkout.
 *                     NOT payment.
 */
export interface GBVBuckets {
  paymentCaptured:     CurrencyAmount[]
  confirmed:           CurrencyAmount[]
  pendingConfirmation: CurrencyAmount[]
  partiallyConfirmed:  CurrencyAmount[]
  failedAfterPayment:  CurrencyAmount[]
  recovered:           CurrencyAmount[]
  proposalValue:       CurrencyAmount[]
  checkoutValue:       CurrencyAmount[]
}

// ── Comparison period helpers ─────────────────────────────────────────────────

export interface PeriodComparison<T> {
  current:       T
  previous:      T
  changePercent: number | null  // null when previous = 0 (show "New" in UI, never divide by zero)
}

export function computeChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

// ── Jade attribution (server-side, authoritative) ─────────────────────────────

/**
 * Returns IDs of Jade-assisted leads created in the given date range.
 * Used as a sub-query input for funnel and GBV analytics.
 *
 * Attribution evidence (in priority order):
 *   1. Lead.jadeAssisted = true (set by CRM sync or Jade lead qualification)
 *   2. Booking.jadeAssisted = true (set by propagateJadeAttribution)
 *   3. CommercialEvent jade_checkout_converted (Jade-assisted self-service trip checkout)
 *
 * Staff review/modification does NOT break Jade attribution.
 * Browser state, URL params, and localStorage are NOT used.
 */
export async function getJadeLeadIds(range: DateRange): Promise<string[]> {
  const leads = await prisma.lead.findMany({
    where: {
      jadeAssisted: true,
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { id: true },
  })
  return leads.map(l => l.id)
}

/**
 * Returns ALL Jade-assisted lead IDs (all time), not range-scoped.
 * Used when the attribution dimension is needed regardless of lead creation date.
 */
export async function getAllJadeLeadIds(): Promise<string[]> {
  const leads = await prisma.lead.findMany({
    where:  { jadeAssisted: true },
    select: { id: true },
  })
  return leads.map(l => l.id)
}

// ── Funnel types ──────────────────────────────────────────────────────────────

export interface FunnelStage {
  label:                  string
  count:                  number
  conversionFromPrevious: number | null  // ratio 0–1; null for first stage or no data
  dropFromPrevious:       number | null  // 1 - conversionFromPrevious; null for first stage
}

export function buildFunnelStages(
  stages: Array<{ label: string; count: number }>,
): FunnelStage[] {
  return stages.map((stage, i) => {
    const prev = i === 0 ? null : stages[i - 1].count
    const conv = (prev === null || prev === 0) ? null : stage.count / prev
    return {
      label:                  stage.label,
      count:                  stage.count,
      conversionFromPrevious: conv,
      dropFromPrevious:       conv === null ? null : 1 - conv,
    }
  })
}

// ── Analytics options ─────────────────────────────────────────────────────────

export interface AnalyticsOpts {
  range:      DateRange
  jadeFilter: JadeFilter
}

// ── Partial confirmation GBV allocation strategy ──────────────────────────────
// For a PARTIALLY_CONFIRMED trip:
//   - Confirmed GBV = sum of TripItem.cost where item.confirmed = true OR item.bookingRef IS NOT NULL
//   - Pending/Failed GBV = sum of TripItem.cost where item is neither confirmed nor failed
//   - Failed After Payment GBV = derived from ActivityBooking.status = FAILED | RECONCILIATION_REQUIRED
// This allocation is applied per-item within the trip, not at the trip level.
// Document: partial GBV is therefore NOT a separate bucket from confirmed/pending — it is
// the combination of confirmed + pending items on the same payment.

// ── Active recovery statuses ──────────────────────────────────────────────────
// Consistent definition across all recovery analytics. OPEN = newly created,
// CONTACTED = outreach made, IN_PROGRESS = actively working recovery.
export const ACTIVE_RECOVERY_STATUSES = ['OPEN', 'CONTACTED', 'IN_PROGRESS'] as const
export type ActiveRecoveryStatus = typeof ACTIVE_RECOVERY_STATUSES[number]

// ── Jade analytics context ────────────────────────────────────────────────────
// Build once per request and pass to analytics functions to eliminate duplicate DB queries.
export interface JadeAnalyticsContext {
  allJadeLeadIds:   string[]   // all-time jade-assisted lead IDs (Lead.jadeAssisted = true)
  rangeJadeLeadIds: string[]   // jade-assisted lead IDs scoped to the current date range
}

export async function buildJadeAnalyticsContext(range: DateRange): Promise<JadeAnalyticsContext> {
  const [allJadeLeadIds, rangeJadeLeadIds] = await Promise.all([
    getAllJadeLeadIds(),
    getJadeLeadIds(range),
  ])
  return { allJadeLeadIds, rangeJadeLeadIds }
}
