'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GbvRow     { currency: string; total: number; count: number }
interface LeadRow    { status: string; count: number }
interface FunnelStep { event: string; count: number }
interface QuotePipeline { [currency: string]: { total: number; markup: number; count: number } }

interface RecoveryTypeRow {
  type: string; open: number; recovered: number; lost: number; dismissed: number; total: number
}
interface StaffPerfRow {
  assignedToId: string; name: string; total: number; contacted: number
  recovered: number; recoveredValue: Record<string, number>
}
interface RecoveryData {
  openValueByCurrency: GbvRow[]; recoveredGbv: GbvRow[]; recoveryRate: number | null
  recoveredCount: number; lostCount: number; closedTotal: number
  byType: RecoveryTypeRow[]; staffPerformance?: StaffPerfRow[]; denominatorNote: string
}

interface CurrencyAmount { currency: string; amount: number }

interface FunnelStage {
  label: string; count: number
  conversionFromPrevious: number | null; dropFromPrevious: number | null
}

interface ExecMetrics {
  leads: number; trips: number; proposals: number
  checkoutStarts: number; paymentsCaptured: number; confirmedBookings: number
}

interface SearchProductMetrics {
  product: string; totalSearches: number; noResultSearches: number
  failedSearches: number; noResultRate: number | null; failureRate: number | null
}

interface ProductPerformance {
  product: string; tripsWithItem: number; paidTrips: number
  confirmedTrips: number; confirmedGBV: CurrencyAmount[]; attachRate: number | null
}

interface ProposalAnalytics {
  created: number; sent: number; accepted: number; declined: number
  expired: number; converted: number
  acceptanceRate: number | null; conversionRate: number | null
  medianDaysToAcceptance: number | null
}

interface CheckoutAnalytics {
  requested: number; ready: number; blocked: number; priceChanged: number
  started: number; abandoned: number; converted: number
  readinessRate: number | null; blockRate: number | null; conversionRate: number | null
  blockReasons: Array<{ reason: string; count: number }>
}

interface PaymentProviderMetrics {
  provider: string; attempts: number; succeeded: number; failed: number
  conversionRate: number | null; capturedGBV: CurrencyAmount[]
}

interface FulfillmentAnalytics {
  paidTrips: number; confirmed: number; partiallyConfirmed: number
  pending: number; supplierFailures: number; confirmationRate: number | null
}

interface RecoveryMetrics {
  openValue: CurrencyAmount[]; recoveredGBV: CurrencyAmount[]; lostValue: CurrencyAmount[]
  openCount: number; recoveredCount: number; lostCount: number
  recoveryRate: number | null; jadeAssistedRecoveredGBV: CurrencyAmount[]
}

interface LeadQualityMetrics {
  hot:  { count: number; bookingRate: number | null }
  warm: { count: number; bookingRate: number | null }
  cold: { count: number; bookingRate: number | null }
}

interface JadeToolMetrics { tool: string; calls: number }

interface StaffMemberMetrics {
  staffId: string; name: string; assignedLeads: number
  proposalsSent: number; proposalsAccepted: number; proposalConversionRate: number | null
}

interface DataHealthIssue { type: string; description: string; count: number }
interface DataHealthResult { issues: DataHealthIssue[]; healthy: boolean }

interface JadeSection {
  assistedBookings:      number
  attributionWindowDays: number
  enabled:    boolean
  range?:     { from: string; to: string; label: string }
  previous?:  { from: string; to: string }
  executive?: { current: ExecMetrics; previous: ExecMetrics | null }
  gbv?: {
    paymentCaptured: CurrencyAmount[]; confirmed: CurrencyAmount[]
    pendingConfirmation: CurrencyAmount[]; partiallyConfirmed: CurrencyAmount[]
    recovered: CurrencyAmount[]
  }
  contribution?: {
    jadeConfirmedGBV: CurrencyAmount[]; nonJadeConfirmedGBV: CurrencyAmount[]
    jadeBookingCount: number; totalBookingCount: number
  }
  funnel?: {
    stages: FunnelStage[]
    directCheckout: { trips: number; payments: number }
    proposalPath:   { proposals: number; accepted: number; payments: number }
  }
  dropoffs?: Array<{ from: string; to: string; dropped: number; dropRate: number | null }>
  search?:       SearchProductMetrics[] | null
  products?:     ProductPerformance[] | null
  proposals?:    ProposalAnalytics | null
  checkout?:     CheckoutAnalytics | null
  payments?:     PaymentProviderMetrics[] | null
  fulfillment?:  FulfillmentAnalytics | null
  recovery?:     RecoveryMetrics | null
  leadQuality?:  LeadQualityMetrics | null
  staff?:        StaffMemberMetrics[] | null
  jadeTools?:    JadeToolMetrics[] | null
  dataHealth?:   DataHealthResult | null
  summary?: {
    bookingTrend: string; largestDropoff: string | null; pendingConfirmation: string | null
  }
  sectionErrors?: Record<string, boolean>
  generatedAt?:       string
  reportingTimezone?: string
  knownLimitations?:  string[]
}

interface RevenueData {
  window: number; trackingStartedAt: string | null
  paymentCaptured: GbvRow[]; confirmedGBV: GbvRow[]
  pendingConfirmation: GbvRow[]; failedAfterPayment: GbvRow[]
  bookingsToday: number; bookingsWeek: number
  activity: { count: number; revenue: number; margin: number; supplierNet: number; currency: string; note: string }
  esim: { count: number; revenue: number; margin: number; currency: string }
  leads: { today: number; week: number; total: number; funnel: LeadRow[] }
  quotes: { pipeline: QuotePipeline; byStatus: Record<string, number>; totalOpen: number }
  cart: { active: number; abandoned: number; converted: number; abandonedValue: number; thresholdMinutes: number }
  formAbandoned: number; funnel: FunnelStep[]; trackingStarted: boolean
  jade: JadeSection; recovery: RecoveryData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
const fmtNum  = (n: number) => new Intl.NumberFormat('en-GB').format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtPct  = (n: number | null) => n === null ? '—' : `${Math.round(n)}%`

const FUNNEL_LABELS: Record<string, string> = {
  flight_search: 'Flight Searches', hotel_search: 'Hotel Searches',
  activity_search: 'Activity Searches', transfer_search: 'Transfer Searches',
  product_view: 'Product Views', lead_created: 'Jade Leads Created',
  checkout_started: 'Checkouts Started', payment_started: 'Payments Started',
  payment_succeeded: 'Payments Succeeded', booking_confirmed: 'Bookings Confirmed',
}

const STATUS_ORDER = ['New', 'Contacted', 'In Progress', 'Deposit Paid', 'Closed', 'Closed Won', 'Closed Lost']
const STATUS_COLOR: Record<string, string> = {
  New: 'bg-blue-500', Contacted: 'bg-amber-500', 'In Progress': 'bg-purple-500',
  'Deposit Paid': 'bg-emerald-500', Closed: 'bg-gray-400',
  'Closed Won': 'bg-green-600', 'Closed Lost': 'bg-red-500',
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children, badge }: { children: React.ReactNode; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">{children}</h2>
      {badge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">{badge}</span>}
    </div>
  )
}

function KpiTile({ label, value, sub, accent = false, warn = false }: {
  label: string; value: string; sub?: string; accent?: boolean; warn?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-[#0B1F3A] text-white' : warn ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-800'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
        accent ? 'text-white/50' : warn ? 'text-red-500' : 'text-gray-400'
      }`}>{label}</p>
      <p className={`text-2xl font-bold leading-none ${accent ? 'text-[#C9A84C]' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-white/40' : warn ? 'text-red-400' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

function GbvBlock({ label, rows, accent = false, warn = false }: {
  label: string; rows: GbvRow[]; accent?: boolean; warn?: boolean
}) {
  if (rows.length === 0) return (
    <div className="rounded-xl p-4 bg-gray-50">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-gray-400">None in period</p>
    </div>
  )
  return (
    <div className={`rounded-xl p-4 ${warn ? 'bg-red-50' : accent ? 'bg-[#0B1F3A]' : 'bg-gray-50'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
        warn ? 'text-red-500' : accent ? 'text-white/50' : 'text-gray-400'
      }`}>{label}</p>
      {rows.map(r => (
        <div key={r.currency} className="flex items-baseline justify-between">
          <span className={`text-lg font-bold ${accent ? 'text-[#C9A84C]' : warn ? 'text-red-700' : 'text-[#0B1F3A]'}`}>
            {fmt(r.total, r.currency)}
          </span>
          <span className={`text-xs ${accent ? 'text-white/40' : 'text-gray-400'}`}>{r.count} bookings</span>
        </div>
      ))}
    </div>
  )
}

// ─── Jade-specific sub-components ─────────────────────────────────────────────

function JadeCurrencyBlock({ label, rows, accent = false, warn = false }: {
  label: string; rows: CurrencyAmount[]; accent?: boolean; warn?: boolean
}) {
  if (rows.length === 0) return (
    <div className="rounded-xl p-4 bg-gray-50">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-gray-400">None in period</p>
    </div>
  )
  return (
    <div className={`rounded-xl p-4 ${warn ? 'bg-red-50' : accent ? 'bg-[#0B1F3A]' : 'bg-gray-50'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
        warn ? 'text-red-500' : accent ? 'text-white/50' : 'text-gray-400'
      }`}>{label}</p>
      {rows.map(r => (
        <p key={r.currency} className={`text-lg font-bold ${accent ? 'text-[#C9A84C]' : warn ? 'text-red-700' : 'text-[#0B1F3A]'}`}>
          {fmt(r.amount, r.currency)}
        </p>
      ))}
    </div>
  )
}

function KpiCompare({ label, current, previous, accent = false }: {
  label: string; current: number; previous: number; accent?: boolean
}) {
  const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-[#0B1F3A]' : 'bg-gray-50'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-white/50' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-2xl font-bold leading-none ${accent ? 'text-[#C9A84C]' : 'text-[#0B1F3A]'}`}>{fmtNum(current)}</p>
      {change !== null ? (
        <p className={`text-xs mt-1 font-semibold ${change >= 0 ? 'text-green-500' : 'text-red-400'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs prior
        </p>
      ) : current > 0 ? (
        <p className={`text-xs mt-1 ${accent ? 'text-white/30' : 'text-gray-400'}`}>New this period</p>
      ) : (
        <p className={`text-xs mt-1 ${accent ? 'text-white/30' : 'text-gray-300'}`}>No data</p>
      )}
    </div>
  )
}

function SectionError({ name }: { name: string }) {
  return (
    <div className="rounded-xl p-4 bg-red-50 border border-red-100">
      <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-0.5">{name}</p>
      <p className="text-xs text-red-400">Failed to load — other sections unaffected</p>
    </div>
  )
}

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-32 mb-4" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: RevenueData }) {
  return (
    <>
      {/* GBV — four buckets */}
      <Card>
        <SectionTitle>Gross Booking Value — last {data.window} days</SectionTitle>
        <p className="text-xs text-gray-400 mb-4">
          Payment Captured = all received payments. Confirmed GBV = supplier-confirmed only.
          These differ when supplier booking is pending or failed.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <GbvBlock label="Payment Captured"     rows={data.paymentCaptured}     accent />
          <GbvBlock label="Confirmed GBV"        rows={data.confirmedGBV} />
          <GbvBlock label="Pending Confirmation" rows={data.pendingConfirmation} />
          <GbvBlock label="Failed After Payment" rows={data.failedAfterPayment}  warn />
        </div>
        <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">Today: <strong className="text-[#0B1F3A]">{data.bookingsToday}</strong> paid</span>
          <span className="text-sm text-gray-500">This week: <strong className="text-[#0B1F3A]">{data.bookingsWeek}</strong> paid</span>
          <span className="text-xs text-amber-600 ml-auto">Refund-adjusted GBV: not yet tracked</span>
        </div>
      </Card>

      {/* Commercial Funnel */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <SectionTitle badge={!data.trackingStarted ? 'Accumulating data' : undefined}>
            Event Activity Funnel — last {data.window} days
          </SectionTitle>
        </div>
        {!data.trackingStarted ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Tracking is now live</p>
            <p className="text-amber-700 text-xs">
              Events are recording. This funnel will populate over 24–72 hours.
              {data.trackingStartedAt && ` Active since ${fmtDate(data.trackingStartedAt)}.`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Total event counts — not unique visitors. Do not compute conversion percentages from these figures.
            </p>
            <div className="space-y-2">
              {data.funnel.map((step, i) => {
                const max = data.funnel[0]?.count ?? 1
                const pct = max > 0 ? (step.count / max) * 100 : 0
                return (
                  <div key={step.event} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                    <span className="text-xs text-gray-600 w-44 flex-shrink-0">{FUNNEL_LABELS[step.event] ?? step.event}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                      <div className="h-2.5 rounded-full bg-[#0B1F3A]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-[#0B1F3A] w-12 text-right">{fmtNum(step.count)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Activity Margin */}
        <Card>
          <SectionTitle>Activity Bookings — confirmed margin</SectionTitle>
          <p className="text-xs text-gray-400 mb-3">{data.activity.note}</p>
          {data.activity.count === 0 ? (
            <p className="text-gray-400 text-sm">No confirmed activity bookings in this period.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Revenue"       value={fmt(data.activity.revenue, data.activity.currency)} sub={`${data.activity.count} bookings`} />
              <KpiTile label="Gross Margin"  value={fmt(data.activity.margin, data.activity.currency)} sub="Markup collected" accent />
              <KpiTile label="Supplier Cost" value={fmt(data.activity.supplierNet, data.activity.currency)} sub="Net to supplier" />
              <KpiTile label="Margin %" value={data.activity.revenue > 0 ? `${((data.activity.margin / data.activity.revenue) * 100).toFixed(1)}%` : '—'} />
            </div>
          )}
        </Card>

        {/* eSIM Margin */}
        <Card>
          <SectionTitle>eSIM Orders — margin tracked (USD)</SectionTitle>
          {data.esim.count === 0 ? (
            <p className="text-gray-400 text-sm">No eSIM orders in this period.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Revenue" value={fmt(data.esim.revenue, 'USD')} sub={`${data.esim.count} orders`} />
              <KpiTile label="Margin"  value={fmt(data.esim.margin, 'USD')} sub="Wholesale spread" accent />
              <KpiTile label="Margin %" value={data.esim.revenue > 0 ? `${((data.esim.margin / data.esim.revenue) * 100).toFixed(1)}%` : '—'} />
              <KpiTile label="Orders"  value={fmtNum(data.esim.count)} sub="Non-cancelled" />
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Lead Funnel */}
        <Card>
          <SectionTitle>Lead Funnel</SectionTitle>
          <div className="flex gap-4 mb-4">
            <span className="text-sm text-gray-500">Today: <strong className="text-[#0B1F3A]">{data.leads.today}</strong></span>
            <span className="text-sm text-gray-500">This week: <strong className="text-[#0B1F3A]">{data.leads.week}</strong></span>
            <span className="text-sm text-gray-500">Total: <strong className="text-[#0B1F3A]">{data.leads.total}</strong></span>
          </div>
          <div className="space-y-2">
            {STATUS_ORDER.filter(s => data.leads.funnel.some(r => r.status === s)).map(status => {
              const row = data.leads.funnel.find(r => r.status === status)
              if (!row) return null
              const pct = data.leads.total > 0 ? (row.count / data.leads.total) * 100 : 0
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-28 flex-shrink-0">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-[#0B1F3A] w-8 text-right">{fmtNum(row.count)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Quote Pipeline */}
        <Card>
          <SectionTitle>Quote Pipeline — open proposals</SectionTitle>
          {data.quotes.totalOpen === 0 ? (
            <p className="text-gray-400 text-sm">No open quotes.</p>
          ) : (
            <>
              <div className="flex gap-3 mb-4 flex-wrap">
                {Object.entries(data.quotes.byStatus).map(([s, n]) => (
                  <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                    {s}: <strong>{n}</strong>
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                {Object.entries(data.quotes.pipeline).map(([cur, val]) => (
                  <div key={cur} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{cur}</p>
                      <p className="text-xs text-gray-400">{val.count} quotes · Est. margin: {fmt(val.markup, cur)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#0B1F3A]">{fmt(val.total, cur)}</p>
                      <p className="text-xs text-gray-400">Customer value</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Cart Abandonment */}
      <Card>
        <SectionTitle>Cart Abandonment — CartSession tracking</SectionTitle>
        <p className="text-xs text-gray-400 mb-4">
          Abandoned = cart with items, not converted, inactive for &gt;{data.cart.thresholdMinutes} minutes.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="Active Carts"    value={fmtNum(data.cart.active)}    sub="Items + recent activity" />
          <KpiTile label="Abandoned Carts" value={fmtNum(data.cart.abandoned)} sub={`>${data.cart.thresholdMinutes}min inactive`} warn={data.cart.abandoned > 0} />
          <KpiTile label="Abandoned Value" value={`~£${fmtNum(Math.round(data.cart.abandonedValue))}`} sub="Mixed currencies" warn={data.cart.abandoned > 0} />
          <KpiTile label="Converted Carts" value={fmtNum(data.cart.converted)} sub="Payment confirmed" accent />
        </div>
      </Card>

      {/* Bottom row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>Form Abandonment</SectionTitle>
          <p className="text-3xl font-bold text-[#0B1F3A]">{fmtNum(data.formAbandoned)}</p>
          <p className="text-xs text-gray-400 mt-1">AbandonedSession records — not converted</p>
        </Card>
        <Card>
          <SectionTitle>Jade Attribution</SectionTitle>
          <p className="text-3xl font-bold text-[#0B1F3A]">{fmtNum(data.jade.assistedBookings)}</p>
          <p className="text-xs text-gray-400 mt-1">Bookings where jadeAssisted = true</p>
          <p className="text-xs text-gray-300 mt-1">Window: {data.jade.attributionWindowDays} days</p>
          <p className="text-xs text-amber-600 mt-1">
            Jade Commerce tab has full analytics →
          </p>
        </Card>
        <Card>
          <SectionTitle>Margin Coverage</SectionTitle>
          <p className="text-sm text-gray-500 font-medium">Activities ✓</p>
          <p className="text-sm text-gray-500">eSIM ✓</p>
          <p className="text-sm text-gray-400">Flights: not yet tracked</p>
          <p className="text-sm text-gray-400">Hotels: not yet tracked</p>
          <p className="text-xs text-gray-300 mt-2">Supplier cost not stored on Booking model</p>
        </Card>
      </div>

      {/* Recovery */}
      {data.recovery && (
        <>
          <Card>
            <SectionTitle>Recovery Engine — opportunity value</SectionTitle>
            <p className="text-xs text-gray-400 mb-4">
              Open value = opportunities in this window still awaiting resolution.
              Recovered GBV = amount confirmed recovered. Currencies displayed separately.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Open Opportunity Value</p>
                {data.recovery.openValueByCurrency.length === 0 ? (
                  <p className="text-sm text-gray-400">None in period</p>
                ) : data.recovery.openValueByCurrency.map(r => (
                  <div key={r.currency} className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-[#0B1F3A]">{fmt(r.total, r.currency)}</span>
                    <span className="text-xs text-gray-400">{r.count} opps</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-4 bg-[#0B1F3A]">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Recovered GBV</p>
                {data.recovery.recoveredGbv.length === 0 ? (
                  <p className="text-sm text-white/40">None yet</p>
                ) : data.recovery.recoveredGbv.map(r => (
                  <div key={r.currency} className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-[#C9A84C]">{fmt(r.total, r.currency)}</span>
                    <span className="text-xs text-white/40">{r.count} recovered</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recovery Rate</p>
                {data.recovery.recoveryRate === null ? (
                  <p className="text-sm text-gray-400">No closed opps yet</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-[#0B1F3A]">{data.recovery.recoveryRate}%</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {data.recovery.recoveredCount} recovered / {data.recovery.closedTotal} closed
                    </p>
                  </>
                )}
                <p className="text-[10px] text-gray-300 mt-2 leading-tight">{data.recovery.denominatorNote}</p>
              </div>
            </div>
          </Card>

          {data.recovery.byType.length > 0 && (
            <Card>
              <SectionTitle>Recovery by Type</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left py-2 font-semibold">Type</th>
                      <th className="text-right py-2 font-semibold">Total</th>
                      <th className="text-right py-2 font-semibold">Open</th>
                      <th className="text-right py-2 font-semibold">Recovered</th>
                      <th className="text-right py-2 font-semibold">Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recovery.byType.sort((a, b) => b.total - a.total).map(row => (
                      <tr key={row.type} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-[#0B1F3A]">{row.type.replace(/_/g, ' ')}</td>
                        <td className="py-2 text-right text-gray-600 font-semibold">{fmtNum(row.total)}</td>
                        <td className="py-2 text-right text-amber-700">{fmtNum(row.open)}</td>
                        <td className="py-2 text-right text-green-700 font-semibold">{fmtNum(row.recovered)}</td>
                        <td className="py-2 text-right text-red-600">{fmtNum(row.lost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {data.recovery.staffPerformance && data.recovery.staffPerformance.length > 0 && (
            <Card>
              <SectionTitle badge="Management">Recovery — Staff Performance</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left py-2 font-semibold">Staff</th>
                      <th className="text-right py-2 font-semibold">Assigned</th>
                      <th className="text-right py-2 font-semibold">Contacted</th>
                      <th className="text-right py-2 font-semibold">Recovered</th>
                      <th className="text-right py-2 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recovery.staffPerformance.map(row => (
                      <tr key={row.assignedToId} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-[#0B1F3A]">{row.name}</td>
                        <td className="py-2 text-right text-gray-600">{fmtNum(row.total)}</td>
                        <td className="py-2 text-right text-gray-600">{fmtNum(row.contacted)}</td>
                        <td className="py-2 text-right text-green-700 font-semibold">{fmtNum(row.recovered)}</td>
                        <td className="py-2 text-right text-[#0B1F3A]">
                          {Object.entries(row.recoveredValue).map(([cur, val]) => (
                            <span key={cur} className="block">{fmt(val, cur)}</span>
                          ))}
                          {Object.keys(row.recoveredValue).length === 0 && <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  )
}

// ─── Jade Commerce tab ────────────────────────────────────────────────────────

function JadeTab({ jade, loading }: { jade: JadeSection; loading: boolean }) {
  if (!jade.enabled) {
    return (
      <Card>
        <p className="text-sm text-gray-500">
          Jade Commerce Analytics is not enabled.
          Set <code className="bg-gray-100 px-1 rounded text-xs">JADE_COMMERCE_ANALYTICS_ENABLED=true</code> to activate.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[4, 3, 5, 3].map((lines, i) => <SkeletonCard key={i} lines={lines} />)}
      </div>
    )
  }

  const errs = jade.sectionErrors ?? {}
  const hasAnyFunnelData = jade.funnel?.stages.some(s => s.count > 0) ?? false

  return (
    <div className="space-y-6">

      {/* Summary banner */}
      {jade.summary && (
        <div className="bg-[#0B1F3A] rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Summary — {jade.range?.label}</p>
          <ul className="space-y-1.5">
            {[jade.summary.bookingTrend, jade.summary.largestDropoff, jade.summary.pendingConfirmation]
              .filter(Boolean).map((line, i) => (
              <li key={i} className="text-sm text-white flex gap-2">
                <span className="text-[#C9A84C] flex-shrink-0">→</span>{line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Executive KPIs */}
      {errs.executive ? <SectionError name="Executive KPIs" /> : jade.executive ? (
        <Card>
          <SectionTitle>Executive KPIs — {jade.range?.label}</SectionTitle>
          {jade.previous && (
            <p className="text-xs text-gray-400 mb-4">
              vs prior period: {fmtDate(jade.previous.from)} – {fmtDate(jade.previous.to)}.
              Jade-assisted journeys only.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCompare label="Leads"            current={jade.executive.current.leads}             previous={jade.executive.previous?.leads             ?? 0} />
            <KpiCompare label="Trips Built"      current={jade.executive.current.trips}             previous={jade.executive.previous?.trips             ?? 0} />
            <KpiCompare label="Proposals"        current={jade.executive.current.proposals}         previous={jade.executive.previous?.proposals         ?? 0} />
            <KpiCompare label="Checkout Starts"  current={jade.executive.current.checkoutStarts}    previous={jade.executive.previous?.checkoutStarts    ?? 0} />
            <KpiCompare label="Payments"         current={jade.executive.current.paymentsCaptured}  previous={jade.executive.previous?.paymentsCaptured  ?? 0} accent />
            <KpiCompare label="Confirmed"        current={jade.executive.current.confirmedBookings} previous={jade.executive.previous?.confirmedBookings ?? 0} accent />
          </div>
        </Card>
      ) : null}

      {/* Financial GBV */}
      {errs.gbv ? <SectionError name="Financial GBV" /> : jade.gbv ? (
        <Card>
          <SectionTitle>Financial GBV — Jade-Assisted Trips</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            Source: TripItem.cost (authoritative). Currencies shown separately — never summed.
            Payment captured ≠ supplier confirmed.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <JadeCurrencyBlock label="Payment Captured"     rows={jade.gbv.paymentCaptured}     accent />
            <JadeCurrencyBlock label="Confirmed"            rows={jade.gbv.confirmed} />
            <JadeCurrencyBlock label="Pending Confirmation" rows={jade.gbv.pendingConfirmation} />
            <JadeCurrencyBlock label="Partially Confirmed (trip total)" rows={jade.gbv.partiallyConfirmed} />
            <JadeCurrencyBlock label="Recovered"            rows={jade.gbv.recovered} />
          </div>
        </Card>
      ) : null}

      {/* Jade Contribution */}
      {errs.contribution ? <SectionError name="Jade Contribution" /> : jade.contribution ? (
        <Card>
          <SectionTitle>Jade Contribution — Confirmed Bookings</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            All-time Jade lead attribution. Confirmed = supplier-confirmed trips. Per currency.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <JadeCurrencyBlock label="Jade-Assisted GBV" rows={jade.contribution.jadeConfirmedGBV}    accent />
            <JadeCurrencyBlock label="Non-Jade GBV"      rows={jade.contribution.nonJadeConfirmedGBV} />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-5">
            <span className="text-sm text-gray-500">Jade bookings: <strong className="text-[#0B1F3A]">{fmtNum(jade.contribution.jadeBookingCount)}</strong></span>
            <span className="text-sm text-gray-500">Total: <strong className="text-[#0B1F3A]">{fmtNum(jade.contribution.totalBookingCount)}</strong></span>
            {jade.contribution.totalBookingCount > 0 && (
              <span className="text-sm text-gray-500">Jade share: <strong className="text-[#C9A84C]">{Math.round((jade.contribution.jadeBookingCount / jade.contribution.totalBookingCount) * 100)}%</strong></span>
            )}
          </div>
        </Card>
      ) : null}

      {/* Jade Commerce Funnel */}
      {errs.funnel ? <SectionError name="Jade Commerce Funnel" /> : jade.funnel ? (
        <Card>
          <SectionTitle>Jade Commerce Funnel — {jade.range?.label}</SectionTitle>
          {!hasAnyFunnelData ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">No Jade activity in this period</p>
              <p className="text-xs text-amber-700">
                The funnel will populate as customers interact with Jade. Check back in 24–72 hours.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">
                Stages 1–2: distinct Jade tool interactions (behavioral).
                Stages 3–7: authoritative Trip/Quote records. Snapshot, not cohort — see Known Limitations.
              </p>
              <div className="space-y-3">
                {jade.funnel.stages.map((stage, i) => {
                  const max = jade.funnel!.stages[0].count
                  const pct = max > 0 ? Math.round((stage.count / max) * 100) : 0
                  return (
                    <div key={stage.label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4 text-right shrink-0">{i + 1}</span>
                      <span className="text-xs text-gray-600 w-40 shrink-0">{stage.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 min-w-0">
                        <div className="h-2.5 rounded-full bg-[#0B1F3A]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-[#0B1F3A] w-12 text-right shrink-0">{fmtNum(stage.count)}</span>
                      <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                        {stage.conversionFromPrevious !== null
                          ? `${Math.round(stage.conversionFromPrevious * 100)}% conv.`
                          : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Direct Checkout Path</p>
                  <p className="text-sm font-semibold text-[#0B1F3A]">{fmtNum(jade.funnel.directCheckout.payments)} payments</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Proposal Path</p>
                  <p className="text-sm font-semibold text-[#0B1F3A]">
                    {fmtNum(jade.funnel.proposalPath.accepted)} accepted / {fmtNum(jade.funnel.proposalPath.proposals)} proposals
                  </p>
                </div>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {/* Top Drop-offs */}
      {jade.dropoffs && jade.dropoffs.length > 0 && (
        <Card>
          <SectionTitle>Funnel Drop-offs — Largest First</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-variant-numeric tabular-nums">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 font-semibold">From</th>
                  <th className="text-left py-2 font-semibold">To</th>
                  <th className="text-right py-2 font-semibold">Dropped</th>
                  <th className="text-right py-2 font-semibold">Drop Rate</th>
                  <th className="text-right py-2 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody>
                {jade.dropoffs.map((d, i) => {
                  const rate = d.dropRate ?? 0
                  const severity = rate >= 50 ? 'High' : rate >= 25 ? 'Medium' : 'Low'
                  const sevColor = rate >= 50 ? 'text-red-600' : rate >= 25 ? 'text-amber-600' : 'text-gray-500'
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-600">{d.from}</td>
                      <td className="py-2 text-gray-600">{d.to}</td>
                      <td className="py-2 text-right font-semibold text-[#0B1F3A]">{fmtNum(d.dropped)}</td>
                      <td className={`py-2 text-right font-bold ${sevColor}`}>
                        {d.dropRate !== null ? `${d.dropRate}%` : '—'}
                      </td>
                      <td className={`py-2 text-right text-xs font-semibold ${sevColor}`}
                        aria-label={`Severity: ${d.dropRate !== null ? severity : 'unknown'}`}>
                        {d.dropRate !== null ? severity : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Search Intelligence */}
      {errs.search ? <SectionError name="Search Intelligence" /> : jade.search && jade.search.length > 0 ? (
        <Card>
          <SectionTitle>Search Intelligence</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            No-result rate = searches with zero results ÷ total searches. Higher = supplier coverage gap.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-variant-numeric tabular-nums">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 font-semibold">Product</th>
                  <th className="text-right py-2 font-semibold">Searches</th>
                  <th className="text-right py-2 font-semibold">No Results</th>
                  <th className="text-right py-2 font-semibold">Failed</th>
                  <th className="text-right py-2 font-semibold">No-Result Rate</th>
                  <th className="text-right py-2 font-semibold">Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {jade.search.map(row => (
                  <tr key={row.product} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-[#0B1F3A] capitalize">{row.product}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.totalSearches)}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.noResultSearches)}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.failedSearches)}</td>
                    <td className={`py-2 text-right font-semibold ${
                      (row.noResultRate ?? 0) >= 20 ? 'text-red-600' :
                      (row.noResultRate ?? 0) >= 10 ? 'text-amber-600' : 'text-gray-600'
                    }`}>{fmtPct(row.noResultRate)}</td>
                    <td className={`py-2 text-right font-semibold ${
                      (row.failureRate ?? 0) >= 10 ? 'text-red-600' :
                      (row.failureRate ?? 0) >= 5  ? 'text-amber-600' : 'text-gray-600'
                    }`}>{fmtPct(row.failureRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Product Performance */}
      {errs.products ? <SectionError name="Product Performance" /> : jade.products && jade.products.length > 0 ? (
        <Card>
          <SectionTitle>Product Performance — Jade Trips</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            Attach rate = confirmed trips with this product ÷ all confirmed Jade trips.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-variant-numeric tabular-nums">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 font-semibold">Product</th>
                  <th className="text-right py-2 font-semibold">Trips with Item</th>
                  <th className="text-right py-2 font-semibold">Attach Rate</th>
                </tr>
              </thead>
              <tbody>
                {jade.products.sort((a, b) => (b.attachRate ?? 0) - (a.attachRate ?? 0)).map(row => (
                  <tr key={row.product} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-[#0B1F3A] capitalize">{row.product}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.tripsWithItem)}</td>
                    <td className={`py-2 text-right font-semibold ${
                      (row.attachRate ?? 0) >= 50 ? 'text-green-700' :
                      (row.attachRate ?? 0) >= 20 ? 'text-[#0B1F3A]' : 'text-gray-400'
                    }`}>{row.attachRate !== null ? `${row.attachRate.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Proposal Analytics */}
      {errs.proposals ? <SectionError name="Proposal Analytics" /> : jade.proposals ? (
        <Card>
          <SectionTitle>Proposal Analytics</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Created"    value={fmtNum(jade.proposals.created)} />
            <KpiTile label="Sent"       value={fmtNum(jade.proposals.sent)} />
            <KpiTile label="Accepted"   value={fmtNum(jade.proposals.accepted)} accent />
            <KpiTile label="Converted"  value={fmtNum(jade.proposals.converted)} accent />
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Declined"  value={fmtNum(jade.proposals.declined)} warn={jade.proposals.declined > 0} />
            <KpiTile label="Expired"   value={fmtNum(jade.proposals.expired)} warn={jade.proposals.expired > 0} />
            <KpiTile label="Accept Rate"  value={fmtPct(jade.proposals.acceptanceRate)} />
            <KpiTile label="Median Days"
              value={jade.proposals.medianDaysToAcceptance !== null
                ? `${jade.proposals.medianDaysToAcceptance.toFixed(1)}d`
                : '—'}
              sub="To acceptance" />
          </div>
        </Card>
      ) : null}

      {/* Checkout Analytics */}
      {errs.checkout ? <SectionError name="Checkout Analytics" /> : jade.checkout ? (
        <Card>
          <SectionTitle>Checkout Analytics</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiTile label="Requested"  value={fmtNum(jade.checkout.requested)} />
            <KpiTile label="Ready"      value={fmtNum(jade.checkout.ready)} sub={fmtPct(jade.checkout.readinessRate) + ' readiness'} accent />
            <KpiTile label="Blocked"    value={fmtNum(jade.checkout.blocked)} sub={fmtPct(jade.checkout.blockRate) + ' block rate'} warn={jade.checkout.blocked > 0} />
            <KpiTile label="Converted"  value={fmtNum(jade.checkout.converted)} sub={fmtPct(jade.checkout.conversionRate) + ' of started'} accent />
          </div>
          {jade.checkout.blockReasons.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Block Reasons</p>
              <div className="space-y-1.5">
                {jade.checkout.blockReasons.slice(0, 8).map(r => (
                  <div key={r.reason} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-48 shrink-0">{r.reason.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-red-400"
                        style={{ width: `${jade.checkout!.blocked > 0 ? (r.count / jade.checkout!.blocked) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-[#0B1F3A] w-8 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      ) : null}

      {/* Payment Providers */}
      {errs.payments ? <SectionError name="Payment Providers" /> : jade.payments && jade.payments.length > 0 ? (
        <Card>
          <SectionTitle>Payment Providers</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            Source: CommercialEvent behavioral data. GBV is from provider events — not the authoritative financial source.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-variant-numeric tabular-nums">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 font-semibold">Provider</th>
                  <th className="text-right py-2 font-semibold">Attempts</th>
                  <th className="text-right py-2 font-semibold">Succeeded</th>
                  <th className="text-right py-2 font-semibold">Failed</th>
                  <th className="text-right py-2 font-semibold">Conv. Rate</th>
                  <th className="text-right py-2 font-semibold">Captured GBV</th>
                </tr>
              </thead>
              <tbody>
                {jade.payments.sort((a, b) => b.succeeded - a.succeeded).map(row => (
                  <tr key={row.provider} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-[#0B1F3A]">{row.provider}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.attempts)}</td>
                    <td className="py-2 text-right text-green-700 font-semibold">{fmtNum(row.succeeded)}</td>
                    <td className="py-2 text-right text-red-600">{fmtNum(row.failed)}</td>
                    <td className="py-2 text-right font-semibold text-[#0B1F3A]">{fmtPct(row.conversionRate)}</td>
                    <td className="py-2 text-right text-[#0B1F3A]">
                      {row.capturedGBV.length > 0
                        ? row.capturedGBV.map(c => <span key={c.currency} className="block">{fmt(c.amount, c.currency)}</span>)
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Fulfillment */}
      {errs.fulfillment ? <SectionError name="Fulfillment" /> : jade.fulfillment ? (
        <Card>
          <SectionTitle>Fulfillment — Payment → Confirmation</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            Payment captured ≠ supplier confirmed. This section shows what happened after payment.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiTile label="Payments Captured"   value={fmtNum(jade.fulfillment.paidTrips)} />
            <KpiTile label="Confirmed"            value={fmtNum(jade.fulfillment.confirmed)} accent />
            <KpiTile label="Partially Confirmed"  value={fmtNum(jade.fulfillment.partiallyConfirmed)} />
            <KpiTile label="Still Confirming"     value={fmtNum(jade.fulfillment.pending)} />
            <KpiTile label="Supplier Failures"    value={fmtNum(jade.fulfillment.supplierFailures)} warn={jade.fulfillment.supplierFailures > 0} />
          </div>
          {jade.fulfillment.confirmationRate !== null && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
              <span className="text-sm text-gray-500">Confirmation rate:</span>
              <span className={`text-lg font-bold ${
                jade.fulfillment.confirmationRate >= 90 ? 'text-green-700' :
                jade.fulfillment.confirmationRate >= 70 ? 'text-amber-600' : 'text-red-600'
              }`}>{jade.fulfillment.confirmationRate.toFixed(1)}%</span>
              <span className="text-xs text-gray-400">(confirmed ÷ all paid trips)</span>
            </div>
          )}
        </Card>
      ) : null}

      {/* Recovery */}
      {errs.recovery ? <SectionError name="Recovery" /> : jade.recovery ? (
        <Card>
          <SectionTitle>Recovery Analytics — Jade-Assisted</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Open Value</p>
              {jade.recovery.openValue.length === 0 ? (
                <p className="text-sm text-gray-400">None</p>
              ) : jade.recovery.openValue.map(c => (
                <p key={c.currency} className="text-lg font-bold text-[#0B1F3A]">{fmt(c.amount, c.currency)}</p>
              ))}
              <p className="text-xs text-gray-400 mt-1">{jade.recovery.openCount} open opps</p>
            </div>
            <div className="rounded-xl p-4 bg-[#0B1F3A]">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Recovered GBV</p>
              {jade.recovery.recoveredGBV.length === 0 ? (
                <p className="text-sm text-white/40">None yet</p>
              ) : jade.recovery.recoveredGBV.map(c => (
                <p key={c.currency} className="text-lg font-bold text-[#C9A84C]">{fmt(c.amount, c.currency)}</p>
              ))}
              <p className="text-xs text-white/40 mt-1">{jade.recovery.recoveredCount} recovered</p>
            </div>
            <div className="rounded-xl p-4 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recovery Rate</p>
              {jade.recovery.recoveryRate === null ? (
                <p className="text-sm text-gray-400">No closed opps yet</p>
              ) : (
                <p className="text-2xl font-bold text-[#0B1F3A]">{Math.round(jade.recovery.recoveryRate)}%</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {jade.recovery.recoveredCount} recovered / {jade.recovery.recoveredCount + jade.recovery.lostCount} closed
              </p>
            </div>
            <div className="rounded-xl p-4 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Jade-Attributed Recovery</p>
              {jade.recovery.jadeAssistedRecoveredGBV.length === 0 ? (
                <p className="text-sm text-gray-400">None</p>
              ) : jade.recovery.jadeAssistedRecoveredGBV.map(c => (
                <p key={c.currency} className="text-lg font-bold text-[#C9A84C]">{fmt(c.amount, c.currency)}</p>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Lead Quality */}
      {errs.leadQuality ? <SectionError name="Lead Quality" /> : jade.leadQuality ? (
        <Card>
          <SectionTitle>Lead Quality</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            {(['hot', 'warm', 'cold'] as const).map(level => {
              const lq = jade.leadQuality![level]
              return (
                <div key={level} className={`rounded-xl p-4 ${level === 'hot' ? 'bg-[#0B1F3A]' : 'bg-gray-50'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${level === 'hot' ? 'text-white/50' : 'text-gray-400'}`}>{level} leads</p>
                  <p className={`text-2xl font-bold leading-none ${level === 'hot' ? 'text-[#C9A84C]' : 'text-[#0B1F3A]'}`}>{fmtNum(lq.count)}</p>
                  <p className={`text-xs mt-1 ${level === 'hot' ? 'text-white/40' : 'text-gray-400'}`}>
                    {lq.bookingRate !== null ? `${lq.bookingRate.toFixed(1)}% book rate` : 'No bookings yet'}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}

      {/* Jade Tool Performance */}
      {errs.jadeTools ? <SectionError name="Jade Tool Performance" /> : jade.jadeTools && jade.jadeTools.length > 0 ? (
        <Card>
          <SectionTitle>Jade Tool Performance</SectionTitle>
          <p className="text-xs text-gray-400 mb-4">
            Call counts from CommercialEvent. May include sandbox sessions.
          </p>
          <div className="space-y-2">
            {jade.jadeTools.sort((a, b) => b.calls - a.calls).map(tool => {
              const max = jade.jadeTools![0]?.calls ?? 1
              const pct = max > 0 ? (tool.calls / max) * 100 : 0
              return (
                <div key={tool.tool} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-48 shrink-0 font-mono">{tool.tool}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0">
                    <div className="h-2 rounded-full bg-[#C9A84C]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-[#0B1F3A] w-12 text-right shrink-0">{fmtNum(tool.calls)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}

      {/* Staff Analytics (management only) */}
      {jade.staff && jade.staff.length > 0 && (
        <Card>
          <SectionTitle badge="Management">Staff Analytics</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-variant-numeric tabular-nums">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 font-semibold">Staff</th>
                  <th className="text-right py-2 font-semibold">Leads</th>
                  <th className="text-right py-2 font-semibold">Proposals Sent</th>
                  <th className="text-right py-2 font-semibold">Accepted</th>
                  <th className="text-right py-2 font-semibold">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {jade.staff.map(row => (
                  <tr key={row.staffId} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-[#0B1F3A]">{row.name}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.assignedLeads)}</td>
                    <td className="py-2 text-right text-gray-600">{fmtNum(row.proposalsSent)}</td>
                    <td className="py-2 text-right text-green-700 font-semibold">{fmtNum(row.proposalsAccepted)}</td>
                    <td className="py-2 text-right font-semibold text-[#0B1F3A]">{fmtPct(row.proposalConversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Data Health (management only) */}
      {jade.dataHealth && (
        <Card>
          <SectionTitle badge="Management">Analytics Data Health</SectionTitle>
          {jade.dataHealth.healthy ? (
            <div className="flex items-center gap-2 text-green-700">
              <span className="text-lg">✓</span>
              <p className="text-sm font-semibold">All diagnostics passed — no issues detected</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-amber-700 mb-3">
                {jade.dataHealth.issues.length} issue{jade.dataHealth.issues.length !== 1 ? 's' : ''} detected.
                Diagnostics only — records not automatically modified.
              </p>
              <div className="space-y-2">
                {jade.dataHealth.issues.map(issue => (
                  <div key={issue.type} className="rounded-xl p-3 bg-amber-50 border border-amber-100">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-semibold text-amber-800 font-mono">{issue.type}</p>
                      <span className="text-xs font-bold text-amber-700">{fmtNum(issue.count)} records</span>
                    </div>
                    <p className="text-xs text-amber-700">{issue.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Data volume warning */}
      {!hasAnyFunnelData && (
        <Card>
          <SectionTitle>Data Health</SectionTitle>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Low data volume in this period</p>
            <p className="text-xs text-amber-700">
              Jade Commerce events may still be accumulating. Results are more reliable after 72 hours of Jade usage.
              Financial GBV is accurate as soon as the first Jade-assisted trip is confirmed.
            </p>
          </div>
        </Card>
      )}

      {/* Known limitations */}
      {jade.knownLimitations && jade.knownLimitations.length > 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Known Limitations</p>
          <ul className="space-y-1.5">
            {jade.knownLimitations.map((l, i) => (
              <li key={i} className="text-xs text-gray-500 flex gap-2">
                <span className="text-gray-300 shrink-0">—</span>
                {l}
              </li>
            ))}
          </ul>
          {jade.generatedAt && (
            <p className="text-[10px] text-gray-300 mt-3">
              Generated {new Date(jade.generatedAt).toLocaleString('en-GB', {
                timeZone: jade.reportingTimezone ?? 'UTC',
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })} ({jade.reportingTimezone ?? 'UTC'})
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function RevenueInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const pathname     = usePathname()

  // Phase 14: URL sanitization — invalid params fall back to safe defaults
  const VALID_TABS       = ['overview', 'jade']
  const VALID_PRESETS    = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month', 'custom']
  const VALID_WINDOWS    = [7, 30, 90]
  const isoDateRe        = /^\d{4}-\d{2}-\d{2}$/

  const rawTab      = searchParams.get('tab')      ?? 'overview'
  const rawRange    = searchParams.get('jadeRange') ?? '30d'
  const rawWindow   = searchParams.get('window')    ?? '30'
  const rawFrom     = searchParams.get('from')      ?? ''
  const rawTo       = searchParams.get('to')        ?? ''

  const tab        = (VALID_TABS.includes(rawTab) ? rawTab : 'overview') as 'overview' | 'jade'
  const jadeRange  = VALID_PRESETS.includes(rawRange) ? rawRange : '30d'
  const parsedWin  = parseInt(rawWindow, 10)
  const windowDays = VALID_WINDOWS.includes(parsedWin) ? parsedWin : 30
  // custom date params: valid ISO dates where from ≤ to
  const customFrom = isoDateRe.test(rawFrom) ? rawFrom : ''
  const customTo   = isoDateRe.test(rawTo)   ? rawTo   : ''

  const [data,    setData]    = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  // Phase 3: local state for custom date pickers before committing to URL
  const [localFrom, setLocalFrom] = useState(customFrom || new Date().toISOString().split('T')[0])
  const [localTo,   setLocalTo]   = useState(customTo   || new Date().toISOString().split('T')[0])

  const setParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const setCustomRange = useCallback((from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('jadeRange', 'custom')
    params.set('from', from)
    params.set('to', to)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let url = `/api/admin/revenue?window=${windowDays}&jadeRange=${jadeRange}`
      if (jadeRange === 'custom' && customFrom && customTo && customFrom <= customTo) {
        url += `&from=${customFrom}&to=${customTo}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [windowDays, jadeRange, customFrom, customTo])

  useEffect(() => { load() }, [load])

  if (error) return <div className="p-8 text-red-600 text-sm font-medium">{error}</div>

  const JADE_RANGE_OPTIONS = [
    { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: '7d' }, { value: '30d', label: '30d' },
    { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' },
    { value: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Revenue Command Centre</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {data?.trackingStartedAt
              ? `Commercial tracking active since ${fmtDate(data.trackingStartedAt)}`
              : 'Release 4E — Commerce Intelligence'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'overview' ? (
            [7, 30, 90].map(w => (
              <button key={w} onClick={() => setParam('window', String(w))}
                aria-label={`Last ${w} days`}
                aria-pressed={windowDays === w}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] ${
                  windowDays === w ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >{w}d</button>
            ))
          ) : (
            <>
              {JADE_RANGE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setParam('jadeRange', opt.value)}
                  aria-label={`Date range: ${opt.label}`}
                  aria-pressed={jadeRange === opt.value}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] ${
                    jadeRange === opt.value ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >{opt.label}</button>
              ))}
              {/* Phase 3: Custom date range pickers */}
              {jadeRange === 'custom' && (
                <div className="flex items-center gap-1 flex-wrap">
                  <input type="date" value={localFrom} onChange={e => setLocalFrom(e.target.value)}
                    max={localTo}
                    aria-label="Custom range start date"
                    className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input type="date" value={localTo} onChange={e => setLocalTo(e.target.value)}
                    min={localFrom}
                    aria-label="Custom range end date"
                    className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                  />
                  <button
                    onClick={() => { if (localFrom && localTo && localFrom <= localTo) setCustomRange(localFrom, localTo) }}
                    disabled={!localFrom || !localTo || localFrom > localTo}
                    aria-label="Apply custom date range"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B1F3A] text-white hover:bg-[#0b1f3a]/90 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]"
                  >Apply</button>
                </div>
              )}
            </>
          )}
          <button onClick={load} disabled={loading}
            aria-label="Refresh data"
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8943d] disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3A]"
          >{loading ? '…' : 'Refresh'}</button>
        </div>
      </div>

      {/* Tab bar — Phase 15: focus-visible ring on tab buttons */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex" role="tablist" aria-label="Revenue dashboard tabs">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'jade',     label: 'Jade Commerce' },
          ] as const).map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`tabpanel-${t.key}`}
              onClick={() => setParam('tab', t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 mr-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-1 ${
                tab === t.key
                  ? 'border-[#C9A84C] text-[#0B1F3A]'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              {t.label}
              {t.key === 'jade' && data?.jade?.enabled && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#C9A84C] font-bold" aria-hidden="true">LIVE</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" aria-label="Loading" />
        </div>
      ) : data ? (
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-label={tab === 'overview' ? 'Overview' : 'Jade Commerce'}>
          {tab === 'overview'
            ? <OverviewTab data={data} />
            : <JadeTab jade={data.jade} loading={loading} />}
        </div>
      ) : null}
    </div>
  )
}

// ─── Page (Suspense wrapper for useSearchParams) ──────────────────────────────

export default function RevenueCommandCenter() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RevenueInner />
    </Suspense>
  )
}
