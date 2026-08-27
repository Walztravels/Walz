'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GbvRow       { currency: string; total: number; count: number }
interface LeadRow      { status: string; count: number }
interface FunnelStep   { event: string; count: number }
interface QuotePipeline { [currency: string]: { total: number; markup: number; count: number } }

interface RevenueData {
  window:          number
  gbv:             GbvRow[]
  bookingsToday:   number
  bookingsWeek:    number
  activity:        { count: number; revenue: number; margin: number; supplierNet: number; currency: string }
  esim:            { count: number; revenue: number; margin: number; currency: string }
  leads:           { today: number; week: number; total: number; funnel: LeadRow[] }
  quotes:          { pipeline: QuotePipeline; byStatus: Record<string, number>; totalOpen: number }
  abandoned:       number
  funnel:          FunnelStep[]
  trackingStarted: boolean
  jade:            { assistedBookings: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtNum = (n: number) => new Intl.NumberFormat('en-GB').format(n)

const FUNNEL_LABELS: Record<string, string> = {
  flight_search:      'Flight Searches',
  hotel_search:       'Hotel Searches',
  activity_search:    'Activity Searches',
  product_view:       'Product Views',
  checkout_started:   'Checkouts Started',
  payment_started:    'Payments Started',
  payment_succeeded:  'Payments Succeeded',
  booking_confirmed:  'Bookings Confirmed',
}

const STATUS_ORDER = ['New', 'Contacted', 'In Progress', 'Deposit Paid', 'Closed', 'Closed Won', 'Closed Lost']
const STATUS_COLOR: Record<string, string> = {
  New:          'bg-blue-500',
  Contacted:    'bg-amber-500',
  'In Progress':'bg-purple-500',
  'Deposit Paid':'bg-emerald-500',
  Closed:       'bg-gray-400',
  'Closed Won': 'bg-green-600',
  'Closed Lost':'bg-red-500',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{children}</h2>
}

function KpiTile({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-[#0B1F3A] text-white' : 'bg-gray-50 text-gray-800'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-white/50' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-2xl font-bold leading-none ${accent ? 'text-[#C9A84C]' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-white/40' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RevenueCommandCenter() {
  const [data,    setData]    = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [window,  setWindow]  = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/revenue?window=${window}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [window])

  useEffect(() => { load() }, [load])

  if (error) return (
    <div className="p-8 text-red-600 text-sm font-medium">{error}</div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Revenue Command Centre</h1>
          <p className="text-sm text-gray-400 mt-0.5">Live data from all booking models — Release 1</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                window === w ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {w}d
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8943d] disabled:opacity-50 transition-colors"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* GBV */}
          <Card>
            <SectionTitle>Gross Booking Value — last {data.window} days</SectionTitle>
            {data.gbv.length === 0 ? (
              <p className="text-gray-400 text-sm">No paid bookings in this period.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.gbv.map(row => (
                  <KpiTile
                    key={row.currency}
                    label={row.currency}
                    value={fmt(row.total, row.currency)}
                    sub={`${fmtNum(row.count)} booking${row.count !== 1 ? 's' : ''}`}
                    accent={row.currency === 'GBP'}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">Today: <strong className="text-[#0B1F3A]">{data.bookingsToday}</strong> paid</span>
              <span className="text-sm text-gray-500">This week: <strong className="text-[#0B1F3A]">{data.bookingsWeek}</strong> paid</span>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">

            {/* Activity Margin */}
            <Card>
              <SectionTitle>Activity Bookings — margin tracked</SectionTitle>
              {data.activity.count === 0 ? (
                <p className="text-gray-400 text-sm">No paid activity bookings in this period.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <KpiTile label="Revenue"       value={fmt(data.activity.revenue, data.activity.currency)} sub={`${data.activity.count} bookings`} />
                  <KpiTile label="Gross Margin"  value={fmt(data.activity.margin, data.activity.currency)} sub="Markup collected" accent />
                  <KpiTile label="Supplier Cost" value={fmt(data.activity.supplierNet, data.activity.currency)} sub="Net to supplier" />
                  <KpiTile
                    label="Margin %"
                    value={data.activity.revenue > 0
                      ? `${((data.activity.margin / data.activity.revenue) * 100).toFixed(1)}%`
                      : '—'}
                    sub="Margin / Revenue"
                  />
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
                  <KpiTile label="Revenue"   value={fmt(data.esim.revenue, 'USD')} sub={`${data.esim.count} orders`} />
                  <KpiTile label="Margin"    value={fmt(data.esim.margin,  'USD')} sub="Wholesale spread" accent />
                  <KpiTile
                    label="Margin %"
                    value={data.esim.revenue > 0
                      ? `${((data.esim.margin / data.esim.revenue) * 100).toFixed(1)}%`
                      : '—'}
                  />
                  <KpiTile label="Orders" value={fmtNum(data.esim.count)} sub="Non-cancelled" />
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
                {STATUS_ORDER
                  .filter(s => data.leads.funnel.some(r => r.status === s))
                  .map(status => {
                    const row = data.leads.funnel.find(r => r.status === status)
                    if (!row) return null
                    const pct = data.leads.total > 0 ? (row.count / data.leads.total) * 100 : 0
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-28 flex-shrink-0">{status}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-[#0B1F3A] w-8 text-right">{fmtNum(row.count)}</span>
                      </div>
                    )
                  })}
                {/* Other statuses not in STATUS_ORDER */}
                {data.leads.funnel
                  .filter(r => !STATUS_ORDER.includes(r.status))
                  .map(row => (
                    <div key={row.status} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-28 flex-shrink-0">{row.status}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-gray-400" style={{ width: `${(row.count / data.leads.total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-[#0B1F3A] w-8 text-right">{fmtNum(row.count)}</span>
                    </div>
                  ))}
              </div>
            </Card>

            {/* Quote Pipeline */}
            <Card>
              <SectionTitle>Quote Pipeline — open quotes</SectionTitle>
              {data.quotes.totalOpen === 0 ? (
                <p className="text-gray-400 text-sm">No open quotes.</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 flex-wrap">
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
                          <p className="text-xs text-gray-400">{val.count} quotes · Markup: {fmt(val.markup, cur)}</p>
                        </div>
                        <p className="text-lg font-bold text-[#0B1F3A]">{fmt(val.total, cur)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Commercial Funnel */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Commercial Funnel — Event Tracking</SectionTitle>
              {!data.trackingStarted && (
                <span className="text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                  Tracking active · accumulating data
                </span>
              )}
            </div>
            {!data.trackingStarted ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">Tracking is now live</p>
                <p className="text-amber-700 text-xs">
                  Commercial events (flight searches, checkouts, payments) started recording today.
                  This funnel will populate over the next 24–72 hours as visitors use the site.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.funnel.map((step, i) => {
                  const max = data.funnel[0]?.count ?? 1
                  const pct = max > 0 ? (step.count / max) * 100 : 0
                  return (
                    <div key={step.event} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                      <span className="text-xs text-gray-600 w-40 flex-shrink-0">{FUNNEL_LABELS[step.event] ?? step.event}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-[#0B1F3A]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-[#0B1F3A] w-10 text-right">{fmtNum(step.count)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Bottom row */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <SectionTitle>Abandoned Sessions</SectionTitle>
              <p className="text-3xl font-bold text-[#0B1F3A]">{fmtNum(data.abandoned)}</p>
              <p className="text-xs text-gray-400 mt-1">Not converted — potential revenue</p>
            </Card>
            <Card>
              <SectionTitle>Jade Attribution</SectionTitle>
              <p className="text-3xl font-bold text-[#0B1F3A]">{fmtNum(data.jade.assistedBookings)}</p>
              <p className="text-xs text-gray-400 mt-1">Bookings with jadeAssisted=true</p>
              {data.jade.assistedBookings === 0 && (
                <p className="text-xs text-amber-600 mt-2">Tracking starts from today — set on new bookings via Jade</p>
              )}
            </Card>
            <Card>
              <SectionTitle>Flights &amp; Hotels Margin</SectionTitle>
              <p className="text-sm text-gray-500">Not yet tracked</p>
              <p className="text-xs text-gray-400 mt-1">
                Supplier cost not stored on <code className="bg-gray-100 px-1 rounded">Booking</code> model.
                Available on <code className="bg-gray-100 px-1 rounded">ActivityBooking</code> and <code className="bg-gray-100 px-1 rounded">EsimOrder</code>.
              </p>
            </Card>
          </div>

        </>
      ) : null}
    </div>
  )
}
