'use client'

import { useState, useEffect, useCallback } from 'react'

interface StaffMetric {
  id: string
  staffId: string
  staffName?: string | null
  period: string
  appsHandled: number
  leads: number
  bookings: number
  avgScore: number
  approvalRate: number
  docQuality: number
  avgResponseTimeHours: number
  revenue: number
  burnoutRisk: number
  burnoutFlag: boolean
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function StaffPerformancePage() {
  const [metrics, setMetrics] = useState<StaffMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [burnoutOnly, setBurnoutOnly] = useState(false)
  const [period, setPeriod] = useState('2026-06')
  const [staffId, setStaffId] = useState('')
  const [computing, setComputing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/staff-performance')
      const data = await res.json()
      setMetrics(data.metrics ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function computePeriod(e: React.FormEvent) {
    e.preventDefault()
    if (!staffId.trim()) return
    setComputing(true)
    try {
      await fetch('/api/admin/intelligence/staff-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staffId.trim(), period }),
      })
      setStaffId('')
      await load()
    } finally {
      setComputing(false)
    }
  }

  const filtered = burnoutOnly ? metrics.filter(m => m.burnoutFlag) : metrics

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Staff Performance Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">KPIs, burnout detection, and coaching insights</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm font-medium text-gray-600">Burnout Risk Only</span>
          <button
            type="button"
            onClick={() => setBurnoutOnly(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${burnoutOnly ? 'bg-red-500' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${burnoutOnly ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Compute Period Metrics</h2>
        <form onSubmit={computePeriod} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Staff ID</label>
            <input className={INPUT} placeholder="staff_..." value={staffId} onChange={e => setStaffId(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Period (YYYY-MM)</label>
            <input
              type="month"
              className={INPUT}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={computing || !staffId.trim()}
            className="h-9 px-5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors"
          >
            {computing ? 'Computing…' : 'Compute Period'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {burnoutOnly ? 'No staff with burnout risk flag.' : 'No performance metrics found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Apps</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bookings</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Approval %</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Doc Quality</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resp. Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Burnout Risk</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((m) => (
                  <tr key={m.id} className={`hover:bg-gray-50/50 transition-colors ${m.burnoutFlag ? 'bg-red-50/30' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0B1F3A] text-xs">{m.staffName ?? m.staffId}</div>
                      <div className="text-xs text-gray-400 font-mono truncate max-w-[100px]">{m.staffId}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 font-mono">{m.period}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.appsHandled}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.leads}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.bookings}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#0B1F3A]">{m.avgScore?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.approvalRate?.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.docQuality?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{m.avgResponseTimeHours?.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#0B1F3A]">£{m.revenue?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.burnoutRisk >= 70 ? 'bg-red-500' : m.burnoutRisk >= 40 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${m.burnoutRisk ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{m.burnoutRisk?.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.burnoutFlag
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">At Risk</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
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
