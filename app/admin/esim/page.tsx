'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Signal, TrendingUp, DollarSign, ShoppingBag,
  Download, RefreshCw, Search,
} from 'lucide-react'

interface EsimOrder {
  id:             string
  orderRef:       string
  destination:    string
  packageName:    string
  durationDays:   number
  dataGb:         number | null
  wholesaleCostUsd: number
  retailPriceUsd: number
  marginUsd:      number
  status:         string
  purchasedAt:    string
  user:           { name: string | null; email: string | null } | null
}

interface Stats {
  totalOrders:   number
  totalRevenue:  number
  totalMargin:   number
  avgOrderValue: number
  monthOrders:   number
  monthRevenue:  number
  monthMargin:   number
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  IN_USE:    'bg-blue-100 text-blue-700',
  pending:   'bg-yellow-100 text-yellow-700',
  expired:   'bg-gray-100 text-gray-500',
  EXPIRED:   'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-600',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AdminEsimPage() {
  const [orders,  setOrders]  = useState<EsimOrder[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/esim')
      const data = await res.json()
      setOrders(data.orders ?? [])
      setStats(data.stats ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function exportCsv() {
    const headers = ['Order Ref', 'Client', 'Email', 'Destination', 'Plan', 'Days', 'Data', 'Wholesale', 'Retail', 'Margin', 'Status', 'Date']
    const rows = orders.map(o => [
      o.orderRef,
      o.user?.name ?? '',
      o.user?.email ?? '',
      o.destination,
      o.packageName,
      o.durationDays,
      o.dataGb ? `${o.dataGb} GB` : 'Unlimited',
      o.wholesaleCostUsd,
      o.retailPriceUsd,
      o.marginUsd,
      o.status,
      new Date(o.purchasedAt).toISOString(),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `jade-connect-esim-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = orders.filter(o =>
    !search ||
    o.destination.toLowerCase().includes(search.toLowerCase()) ||
    o.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
    o.orderRef.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center">
            <Signal className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="font-display font-bold text-[#0B1F3A] text-2xl">Jade Connect eSIM</h1>
            <p className="text-[#0B1F3A]/50 text-sm">All eSIM orders and revenue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2.5 border border-[#E5E7EB] rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 text-[#0B1F3A]/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-xl hover:bg-[#0d2345] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: ShoppingBag,
              label: 'This Month Orders',
              value: stats.monthOrders,
              sub: `${stats.totalOrders} all time`,
              format: 'int',
            },
            {
              icon: DollarSign,
              label: 'This Month Revenue',
              value: stats.monthRevenue,
              sub: `$${fmt(stats.totalRevenue)} all time`,
              format: 'usd',
            },
            {
              icon: TrendingUp,
              label: 'This Month Margin',
              value: stats.monthMargin,
              sub: `$${fmt(stats.totalMargin)} all time`,
              format: 'usd',
            },
            {
              icon: Signal,
              label: 'Avg Order Value',
              value: stats.avgOrderValue,
              sub: 'all time average',
              format: 'usd',
            },
          ].map(({ icon: Icon, label, value, sub, format }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-[#C9A84C]" />
                <p className="text-[#0B1F3A]/50 text-xs font-medium">{label}</p>
              </div>
              <p className="font-bold text-[#0B1F3A] text-2xl mb-1">
                {format === 'usd' ? `$${fmt(value)}` : value}
              </p>
              <p className="text-[#0B1F3A]/40 text-xs">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B1F3A]/30" />
        <input
          type="text"
          placeholder="Search by destination, email or order ref…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 border border-[#E5E7EB] rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA]">
                {['Client', 'Destination', 'Plan', 'Wholesale', 'Retail', 'Margin', 'Status', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[#0B1F3A]/40 text-sm">
                    {search ? 'No orders match your search.' : 'No eSIM orders yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0B1F3A] text-sm">{o.user?.name ?? '—'}</p>
                      <p className="text-[#0B1F3A]/40 text-xs">{o.user?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#0B1F3A] font-medium">{o.destination}</p>
                      <p className="text-[#0B1F3A]/40 text-xs">{o.orderRef}</p>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/70">
                      <p>{o.packageName}</p>
                      <p className="text-xs text-[#0B1F3A]/40">
                        {o.durationDays}d · {o.dataGb ? `${o.dataGb} GB` : 'Unlimited'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/60 font-mono text-xs">
                      ${fmt(o.wholesaleCostUsd)}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0B1F3A]">
                      ${fmt(o.retailPriceUsd)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-600">
                      +${fmt(o.marginUsd)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/50 text-xs whitespace-nowrap">
                      {new Date(o.purchasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E5E7EB] text-xs text-[#0B1F3A]/40 flex items-center justify-between">
            <span>{filtered.length} orders</span>
            <span>
              Total revenue: <strong className="text-[#0B1F3A]">
                ${fmt(filtered.reduce((s, o) => s + o.retailPriceUsd, 0))}
              </strong>
              {' '}· Total margin: <strong className="text-green-600">
                ${fmt(filtered.reduce((s, o) => s + o.marginUsd, 0))}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
