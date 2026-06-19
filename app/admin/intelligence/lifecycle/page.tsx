'use client'

import { useState, useEffect, useCallback } from 'react'

type Cohort = 'all' | 'champion' | 'loyal' | 'new' | 'at_risk'

interface LifecyclePrediction {
  id: string
  userId: string
  userName?: string | null
  cohort: 'champion' | 'loyal' | 'new' | 'at_risk'
  predictedLtv: number
  ltv12mo: number
  ltv36mo: number
  nextService?: string | null
  churnProbability: number
  referralProbability: number
  upgradeReadiness: number
  priceElasticity: number
  computedAt: string
}

const COHORTS: Cohort[] = ['all', 'champion', 'loyal', 'new', 'at_risk']

const COHORT_BADGE: Record<string, string> = {
  champion: 'bg-[#C9A84C]/10 text-[#C9A84C]',
  loyal: 'bg-blue-100 text-blue-700',
  new: 'bg-green-100 text-green-700',
  at_risk: 'bg-red-100 text-red-700',
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function LifecyclePage() {
  const [predictions, setPredictions] = useState<LifecyclePrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [cohortFilter, setCohortFilter] = useState<Cohort>('all')
  const [userId, setUserId] = useState('')
  const [computing, setComputing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/lifecycle')
      const data = await res.json()
      setPredictions(data.predictions ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function computePrediction(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim()) return
    setComputing(true)
    try {
      await fetch('/api/admin/intelligence/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() }),
      })
      setUserId('')
      await load()
    } finally {
      setComputing(false)
    }
  }

  const filtered = cohortFilter === 'all' ? predictions : predictions.filter(p => p.cohort === cohortFilter)

  const cohortCounts = (COHORTS.filter(c => c !== 'all') as string[]).reduce<Record<string, number>>((acc, c) => {
    acc[c] = predictions.filter(p => p.cohort === c).length
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Client Lifecycle Predictions</h1>
          <p className="text-sm text-gray-500 mt-1">LTV, churn probability, and next-service prediction</p>
        </div>
      </div>

      {/* Cohort stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(COHORTS.filter(c => c !== 'all') as string[]).map(c => (
          <div key={c} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-2xl font-bold text-[#0B1F3A] mb-1">{cohortCounts[c] ?? 0}</div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${COHORT_BADGE[c]}`}>
              {c.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Compute Prediction for a Client</h2>
        <form onSubmit={computePrediction} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">User ID</label>
            <input className={INPUT} placeholder="e.g. clxyz123..." value={userId} onChange={e => setUserId(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={computing || !userId.trim()}
            className="h-9 px-5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors"
          >
            {computing ? 'Computing…' : 'Compute Prediction'}
          </button>
        </form>
      </div>

      {/* Cohort filter */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {COHORTS.map(c => (
          <button
            key={c}
            onClick={() => setCohortFilter(c)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              cohortFilter === c ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No lifecycle predictions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cohort</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pred. LTV</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LTV 12mo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LTV 36mo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Churn %</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Referral %</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Upgrade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price Elast.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Computed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0B1F3A] text-xs truncate max-w-[120px]">{p.userName ?? p.userId}</div>
                      <div className="text-xs text-gray-400 font-mono truncate max-w-[120px]">{p.userId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${COHORT_BADGE[p.cohort]}`}>
                        {p.cohort?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-[#0B1F3A]">£{p.predictedLtv?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">£{p.ltv12mo?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">£{p.ltv36mo?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[100px] truncate">{p.nextService ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${p.churnProbability > 0.5 ? 'text-red-600' : 'text-gray-700'}`}>
                        {((p.churnProbability ?? 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{((p.referralProbability ?? 0) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{((p.upgradeReadiness ?? 0) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{p.priceElasticity?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(p.computedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
