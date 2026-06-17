'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Users, CreditCard, FileText, RefreshCw, Loader2 } from 'lucide-react'

interface AnalyticsData {
  totalBookings:   number
  totalRevenue:    number
  totalClients:    number
  totalVisaApps:   number
  bookingsByMonth: { month: string; count: number; revenue: number }[]
  visaByStatus:    { status: string; count: number }[]
  topDestinations: { destination: string; count: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:                 'bg-gray-400',
  received:              'bg-blue-500',
  documents_pending:     'bg-amber-500',
  under_review:          'bg-purple-500',
  ready_to_submit:       'bg-indigo-500',
  submitted_to_embassy:  'bg-teal-500',
  decision_pending:      'bg-orange-500',
  approved:              'bg-green-500',
  refused:               'bg-red-500',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `£${(n / 1_000).toFixed(1)}K`
  return `£${n.toFixed(0)}`
}

function monthLabel(iso: string) {
  const [y, m] = iso.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export default function AnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const maxBookings = data ? Math.max(...data.bookingsByMonth.map(b => b.count), 1) : 1
  const maxRevenue  = data ? Math.max(...data.bookingsByMonth.map(b => b.revenue), 1) : 1
  const totalVisa   = data?.visaByStatus.reduce((s, v) => s + v.count, 0) ?? 0

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Business performance overview</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-center py-32 text-gray-400">Failed to load analytics</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={CreditCard} label="Total Bookings" value={String(data.totalBookings)} color="blue" />
            <StatCard icon={TrendingUp} label="Revenue"        value={fmt(data.totalRevenue)}      color="green" />
            <StatCard icon={Users}      label="Clients"        value={String(data.totalClients)}   color="purple" />
            <StatCard icon={FileText}   label="Visa Apps"      value={String(data.totalVisaApps)}  color="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bookings by month */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-bold text-[#0B1F3A] mb-1">Bookings — Last 6 Months</h2>
              <p className="text-xs text-gray-400 mb-6">Count and revenue per month</p>
              {data.bookingsByMonth.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-8">No booking data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.bookingsByMonth.map(b => (
                    <div key={b.month}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-500">{monthLabel(b.month)}</span>
                        <span className="text-xs text-gray-400">{b.count} bookings · {fmt(b.revenue)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C9A84C] rounded-full transition-all"
                          style={{ width: `${(b.count / maxBookings) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visa by status */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-bold text-[#0B1F3A] mb-1">Visa Applications</h2>
              <p className="text-xs text-gray-400 mb-6">By current status</p>
              {data.visaByStatus.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-8">No visa data yet</p>
              ) : (
                <div className="space-y-2">
                  {data.visaByStatus.map(v => (
                    <div key={v.status} className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[v.status] ?? 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-600 flex-1 capitalize">{v.status.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-bold text-[#0B1F3A]">{v.count}</span>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${STATUS_COLORS[v.status] ?? 'bg-gray-400'}`}
                          style={{ width: `${totalVisa > 0 ? (v.count / totalVisa) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Revenue bar chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-bold text-[#0B1F3A] mb-1">Revenue — Last 6 Months</h2>
            <p className="text-xs text-gray-400 mb-6">Monthly revenue trend</p>
            {data.bookingsByMonth.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-8">No revenue data yet</p>
            ) : (
              <div className="flex items-end gap-3 h-32">
                {data.bookingsByMonth.map(b => (
                  <div key={b.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-400">{fmt(b.revenue)}</span>
                    <div className="w-full bg-[#0B1F3A] rounded-t-lg transition-all"
                      style={{ height: `${maxRevenue > 0 ? (b.revenue / maxRevenue) * 80 : 4}px`, minHeight: '4px' }} />
                    <span className="text-[10px] text-gray-500">{monthLabel(b.month)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string
  color: 'blue' | 'green' | 'purple' | 'amber'
}) {
  const cls = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber:  'bg-amber-50 text-amber-600',
  }[color]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${cls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-[#0B1F3A]">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
