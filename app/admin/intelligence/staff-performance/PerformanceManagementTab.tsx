'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface QueueRow {
  staffId: string
  name: string
  email: string
  role: string
  department: string
  isActive: boolean
  sales: {
    lastCompletedSaleAt: string | null
    daysSinceLastSale: number | null
    salesLast30: number
    salesLast90: number
    salesLast120: number
    salesCurrentYear: number
    revenueByCurrency: Record<string, number>
    hasAnyBookingEver: boolean
  }
  signal: 'NONE' | 'MONITOR_30' | 'MONITOR_60' | 'MONITOR_90' | 'REVIEW_RECOMMENDED_120'
  eligibility: { eligible: boolean; reasons: string[]; tenureUnknown: boolean }
  currentCaseId: string | null
  currentCaseStatus: string | null
  nextReviewDate: string | null
  previousActionsCount: number
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: '30', label: '30+ days' },
  { key: '60', label: '60+ days' },
  { key: '90', label: '90+ days' },
  { key: '120', label: '120+ days' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'PIP_ACTIVE', label: 'PIP Active' },
  { key: 'IMPROVED', label: 'Improved' },
  { key: 'FOLLOW_UP_DUE', label: 'Follow-up Due' },
]

const SIGNAL_LABEL: Record<string, string> = {
  NONE: '—',
  MONITOR_30: 'No completed sale for 30 days',
  MONITOR_60: 'No completed sale for 60 days',
  MONITOR_90: 'No completed sale for 90 days',
  REVIEW_RECOMMENDED_120: 'PERFORMANCE REVIEW RECOMMENDED',
}

function fmtDate(d: string | null): string {
  if (!d) return 'No sale on record'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function revenueLine(rev: Record<string, number>): string {
  const entries = Object.entries(rev)
  if (entries.length === 0) return '—'
  return entries.map(([cur, amt]) => `${cur} ${amt.toLocaleString()}`).join(' · ')
}

export default function PerformanceManagementTab() {
  const [filter, setFilter] = useState('ALL')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (f: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/performance/queue?filter=${f}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Failed to load the performance review queue.'); setRows([]); return }
      setRows(data.rows ?? [])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          A management signal only — not an instruction. A human Super Admin reviews the evidence and decides any
          management action. No warning is ever generated or sent automatically.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button onClick={() => void load(filter)} className="text-sm font-semibold text-[#C9A84C] hover:underline">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No staff members match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role / Dept</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Sale</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Days Since</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sales 30/90/120d</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue (120d)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Review</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.staffId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0B1F3A] text-xs">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.email}</div>
                      {!r.eligibility.eligible && (
                        <div className="text-[10px] text-amber-600 mt-0.5">{r.eligibility.reasons[0]}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {r.role}
                      <div className="text-gray-400">{r.department}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{fmtDate(r.sales.lastCompletedSaleAt)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">{r.sales.daysSinceLastSale ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {r.sales.salesLast30} / {r.sales.salesLast90} / {r.sales.salesLast120}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{revenueLine(r.sales.revenueByCurrency)}</td>
                    <td className="px-4 py-3">
                      {r.signal === 'REVIEW_RECOMMENDED_120' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">{SIGNAL_LABEL[r.signal]}</span>
                      ) : r.signal !== 'NONE' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">{SIGNAL_LABEL[r.signal]}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{r.currentCaseStatus ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{r.nextReviewDate ? fmtDate(r.nextReviewDate) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/intelligence/staff-performance/review/${r.staffId}`}
                        className="text-xs font-semibold text-[#C9A84C] hover:underline whitespace-nowrap"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
