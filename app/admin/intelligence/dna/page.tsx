'use client'

import { useState, useEffect, useCallback } from 'react'

interface DnaRecord {
  id: string
  userId: string
  userName?: string | null
  analysisCount: number
  averageScore: number
  peakScore: number
  trend: 'up' | 'down' | 'stable'
  latestBalance: number
  provenTraveller: boolean
  lastAnalysisAt: string
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function FinancialDnaPage() {
  const [records, setRecords] = useState<DnaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [computing, setComputing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/dna')
      const data = await res.json()
      setRecords(data.records ?? data ?? [])
    } catch {
      setError('Failed to load Financial DNA records.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function computeDna(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId.trim()) return
    setComputing(true)
    try {
      await fetch('/api/admin/intelligence/dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId.trim() }),
      })
      setSelectedUserId('')
      await load()
    } finally {
      setComputing(false)
    }
  }

  function trendBadge(trend: string) {
    if (trend === 'up') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Up</span>
    if (trend === 'down') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Down</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Stable</span>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Client Financial DNA</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered financial health tracking per client</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Compute DNA for a Client</h2>
        <form onSubmit={computeDna} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">User ID</label>
            <input
              className={INPUT}
              placeholder="e.g. clxyz123..."
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={computing || !selectedUserId.trim()}
            className="h-9 px-5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors"
          >
            {computing ? 'Computing…' : 'Compute DNA'}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400 mt-3">Loading records…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No Financial DNA records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Analyses</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Peak Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trend</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Latest Balance</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proven</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Analysis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0B1F3A] text-xs truncate max-w-[140px]">{r.userName ?? r.userId}</div>
                      <div className="text-xs text-gray-400 font-mono truncate max-w-[140px]">{r.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.analysisCount}</td>
                    <td className="px-4 py-3 text-gray-700">{r.averageScore?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-gray-700">{r.peakScore?.toFixed(1)}</td>
                    <td className="px-4 py-3">{trendBadge(r.trend)}</td>
                    <td className="px-4 py-3 text-gray-700">£{r.latestBalance?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.provenTraveller
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Yes</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">No</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(r.lastAnalysisAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
