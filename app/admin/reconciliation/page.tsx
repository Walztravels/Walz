'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertTriangle, Download } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReconciliationRow {
  id: string
  bookingReference: string
  type: string
  status: string
  paymentStatus: string
  contactEmail: string
  currency: string
  totalAmount: number
  supplierNet: number | null
  grossProfit: number | null
  markupPct: number | null
  createdAt: string
}

interface ReconciliationSummary {
  bookings: ReconciliationRow[]
  total: number
  revenue: number
  cost: number
  profit: number
  avgMargin: number
}

const PRODUCT_TYPES = ['ALL', 'FLIGHT', 'HOTEL', 'TRANSFER', 'PACKAGE', 'ACTIVITY'] as const
type ProductType = (typeof PRODUCT_TYPES)[number]

const TYPE_COLORS: Record<string, string> = {
  FLIGHT: 'bg-blue-900/40 text-blue-300 border-blue-700',
  HOTEL: 'bg-green-900/40 text-green-300 border-green-700',
  TRANSFER: 'bg-purple-900/40 text-purple-300 border-purple-700',
  PACKAGE: 'bg-rose-900/40 text-rose-300 border-rose-700',
  ACTIVITY: 'bg-amber-900/40 text-amber-300 border-amber-700',
}

const PAYMENT_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-green-900/30 text-green-300 border-green-700',
  PENDING: 'bg-amber-900/30 text-amber-300 border-amber-700',
  FAILED: 'bg-red-900/30 text-red-400 border-red-700',
  PROCESSING: 'bg-blue-900/30 text-blue-300 border-blue-700',
  REFUNDED: 'bg-slate-700/60 text-slate-300 border-slate-600',
  CANCELLED: 'bg-slate-700/60 text-slate-400 border-slate-600',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number | null | undefined, currency = 'GBP') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

function exportCsv(rows: ReconciliationRow[]) {
  const headers = [
    'Reference', 'Type', 'Date', 'Client Email', 'Currency',
    'Supplier Cost', 'Selling Price', 'Markup %', 'Gross Profit', 'Payment Status',
  ]
  const lines = rows.map(r => [
    r.bookingReference,
    r.type,
    fmtDate(r.createdAt),
    r.contactEmail,
    r.currency,
    r.supplierNet ?? '',
    r.totalAmount,
    r.markupPct != null ? r.markupPct.toFixed(1) : '',
    r.grossProfit ?? '',
    r.paymentStatus,
  ].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `walz-reconciliation-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-xl p-5">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const { from: defaultFrom, to: defaultTo } = currentMonthRange()

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [type, setType] = useState<ProductType>('ALL')
  const [data, setData] = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to, type })
      const res = await fetch(`/api/admin/reconciliation?${params.toString()}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json = await res.json() as ReconciliationSummary
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [from, to, type])

  useEffect(() => { load() }, [load])

  const rows = data?.bookings ?? []

  return (
    <div className="min-h-screen bg-[#061320] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Reconciliation</h1>
            <p className="text-sm text-slate-400 mt-1">Revenue, cost, and margin analysis across bookings</p>
          </div>
          <button
            onClick={() => exportCsv(rows)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 bg-[#C9A84C] hover:bg-[#e0be70] disabled:opacity-40 disabled:cursor-not-allowed text-[#061320] font-bold text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-xl p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">Product Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as ProductType)}
              className="bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
            >
              {PRODUCT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Stats row ── */}
        {data && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={fmt(data.revenue)} sub={`${data.total} bookings`} />
            <StatCard label="Total Cost" value={fmt(data.cost)} sub="supplier nets" />
            <StatCard
              label="Gross Profit"
              value={fmt(data.profit)}
              sub={data.profit >= 0 ? 'positive margin' : 'negative margin'}
            />
            <StatCard label="Avg Margin" value={fmtPct(data.avgMargin)} sub="across bookings with cost data" />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-3 bg-red-900/20 border border-red-900/40 rounded-xl px-4 py-3 text-red-400 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Table ── */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-[#C9A84C] animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">No bookings found for the selected period and filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#1a2f4a]">
                    {[
                      'Reference', 'Type', 'Date', 'Client Email', 'Currency',
                      'Supplier Cost', 'Selling Price', 'Markup %', 'Gross Profit', 'Payment',
                    ].map(h => (
                      <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wider py-3 px-4 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const profitPositive = row.grossProfit != null && row.grossProfit >= 0
                    const profitNegative = row.grossProfit != null && row.grossProfit < 0

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-[#1a2f4a]/50 hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs text-white">{row.bookingReference}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[row.type] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">
                          {fmtDate(row.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-300 text-xs max-w-[160px] truncate">
                          {row.contactEmail}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{row.currency}</td>
                        <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">
                          {row.supplierNet != null ? fmt(row.supplierNet, row.currency) : '—'}
                        </td>
                        <td className="py-3 px-4 text-white font-medium whitespace-nowrap">
                          {fmt(row.totalAmount, row.currency)}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          {fmtPct(row.markupPct)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {row.grossProfit != null ? (
                            <span className={`text-sm font-semibold ${profitPositive ? 'text-green-400' : profitNegative ? 'text-red-400' : 'text-slate-400'}`}>
                              {fmt(row.grossProfit, row.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PAYMENT_COLORS[row.paymentStatus?.toUpperCase()] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                            {row.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
