'use client'

import { fetchRecords } from '@/lib/intelligence/fetch-records'
import { useState, useEffect, useCallback } from 'react'

type Band = 'all' | 'green' | 'yellow' | 'orange' | 'red'

interface CrisScore {
  id: string
  userId: string
  userName?: string | null
  overallScore: number
  applicationQuality: number
  documentReliability: number
  paymentReliability: number
  communication: number
  visaSuccessRate: number
  riskBand: 'green' | 'yellow' | 'orange' | 'red'
  computedAt: string
}

const BANDS: Band[] = ['all', 'green', 'yellow', 'orange', 'red']

const BAND_DOT: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
}

const BAND_BADGE: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
}

const BAND_BAR: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

/** Deterministic readiness output (INT-3). */
interface Readiness {
  overall: number | null
  dimensionsScored: number
  note: string
  dimensions: Array<{
    key: string; label: string; score: number | null
    status: 'STRONG' | 'ADEQUATE' | 'ATTENTION' | 'INSUFFICIENT_DATA'
    evidence: string[]; issues: string[]
  }>
}

const READINESS_STATUS_STYLE: Record<string, string> = {
  STRONG:            'bg-green-100 text-green-700',
  ADEQUATE:          'bg-blue-100 text-blue-700',
  ATTENTION:         'bg-amber-100 text-amber-800',
  INSUFFICIENT_DATA: 'bg-gray-100 text-gray-500',
}

export default function CrisPage() {
  const [scores, setScores] = useState<CrisScore[]>([])
  const [loading, setLoading] = useState(true)
  const [bandFilter, setBandFilter] = useState<Band>('all')
  const [userId, setUserId] = useState('')
  const [computing, setComputing] = useState(false)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [computeError, setComputeError] = useState('')

  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const result = await fetchRecords<CrisScore>('/api/admin/intelligence/cris', 'scores')
    if (result.ok) setScores(result.records)
    else { setScores([]); setLoadError(result.error) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function computeCris(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim()) return
    setComputing(true)
    setReadiness(null)
    setComputeError('')
    try {
      const res  = await fetch('/api/admin/intelligence/cris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setComputeError((data.error as string) ?? `Computation failed (HTTP ${res.status}).`); return }
      if (data.readiness) setReadiness(data.readiness as Readiness)
      setUserId('')
      await load()
    } catch {
      setComputeError('Network error while computing — please try again.')
    } finally {
      setComputing(false)
    }
  }

  const filtered = bandFilter === 'all' ? scores : scores.filter(s => s.riskBand === bandFilter)

  const bandCounts = BANDS.filter(b => b !== 'all').reduce<Record<string, number>>((acc, b) => {
    acc[b] = scores.filter(s => s.riskBand === b).length
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Application Readiness (CRIS)</h1>
          <p className="text-sm text-gray-500 mt-1">Deterministic, evidence-backed readiness dimensions — an internal indicator, never a visa-approval probability</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(BANDS.filter(b => b !== 'all') as string[]).map(b => (
          <div key={b} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${BAND_DOT[b]}`} />
            <div>
              <div className="text-2xl font-bold text-[#0B1F3A]">{bandCounts[b] ?? 0}</div>
              <div className="text-xs text-gray-500 capitalize">{b} band</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Compute CRIS for a Client</h2>
        <form onSubmit={computeCris} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">User ID</label>
            <input className={INPUT} placeholder="e.g. clxyz123..." value={userId} onChange={e => setUserId(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={computing || !userId.trim()}
            className="h-9 px-5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors"
          >
            {computing ? 'Computing…' : 'Compute CRIS'}
          </button>
        </form>
      </div>

      {computeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{computeError}</div>
      )}

      {readiness && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">Application Readiness</h2>
            <span className="text-2xl font-black text-[#0B1F3A]">{readiness.overall != null ? `${readiness.overall}/100` : '—'}</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-4">{readiness.note}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {readiness.dimensions.map(d => (
              <div key={d.key} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[#0B1F3A]">{d.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${READINESS_STATUS_STYLE[d.status]}`}>
                    {d.score != null ? `${d.score} · ` : ''}{d.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {d.evidence.length > 0 && (
                  <p className="text-[10px] text-gray-400 mb-1">Evidence: {d.evidence.join('; ')}</p>
                )}
                {d.issues.length > 0 && (
                  <ul className="text-[11px] text-amber-800 list-disc pl-4 space-y-0.5">
                    {d.issues.slice(0, 5).map((iss, i) => <li key={i}>{iss}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Band filter */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {BANDS.map(b => (
          <button
            key={b}
            onClick={() => setBandFilter(b)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              bandFilter === b ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {b !== 'all' && <span className={`w-2 h-2 rounded-full ${BAND_DOT[b]}`} />}
            {b}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <p className="text-sm text-red-600 mb-2">{loadError}</p>
            <button onClick={() => void load()} className="text-sm font-semibold text-[#C9A84C] hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No CRIS scores found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">App Quality</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Doc Reliability</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comms</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Visa Success</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Band</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Computed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0B1F3A] text-xs truncate max-w-[120px]">{s.userName ?? s.userId}</div>
                      <div className="text-xs text-gray-400 font-mono truncate max-w-[120px]">{s.userId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${BAND_BAR[s.riskBand]}`}
                            style={{ width: `${s.overallScore ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#0B1F3A]">{s.overallScore?.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{s.applicationQuality?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{s.documentReliability?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{s.paymentReliability?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{s.communication?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{s.visaSuccessRate?.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${BAND_BADGE[s.riskBand]}`}>
                        {s.riskBand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(s.computedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
