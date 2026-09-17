'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchRecords } from '@/lib/intelligence/fetch-records'

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

/** Evidence-attributed Financial DNA output (INT-1). */
interface DnaValue { value: number | null; basis?: string; currency?: string | null; reason?: string; tier?: string }
interface DnaOutput {
  version: string
  snapshotsUsed: number
  declaredMonthlyIncome: DnaValue
  observedMonthlyIncome: DnaValue
  incomeConsistency: { deltaPct: number | null; note: string }
  closingBalance: DnaValue
  lowestBalance: DnaValue
  averageBalance: DnaValue
  balanceTrend: { direction: string | null; deltaPct: number | null; note: string }
  tripCost: DnaValue
  fundingCoverage: { ratio: number | null; note: string; fxRate?: number; fxSource?: string; fxPair?: string }
  reviewItems: Array<{ item: string; evidence: string }>
}

function DnaMoney({ label, v }: { label: string; v: DnaValue }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
      {v.value != null ? (
        <>
          <div className="text-lg font-black text-[#0B1F3A]">{v.currency ? `${v.currency} ` : ''}{v.value.toLocaleString()}</div>
          {v.basis && <div className="text-[10px] text-gray-400 mt-0.5">{v.basis}</div>}
        </>
      ) : (
        <div className="text-xs text-gray-400 mt-1">{v.reason ?? 'Not available'}</div>
      )}
    </div>
  )
}

export default function FinancialDnaPage() {
  const [records, setRecords] = useState<DnaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [computing, setComputing] = useState(false)
  const [dna, setDna] = useState<DnaOutput | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchRecords<DnaRecord>('/api/admin/intelligence/dna', 'records')
    if (result.ok) setRecords(result.records)
    else { setRecords([]); setError(result.error) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function computeDna(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId.trim()) return
    setComputing(true)
    setDna(null)
    setError(null)
    try {
      const res  = await fetch('/api/admin/intelligence/dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError((data.error as string) ?? `Computation failed (HTTP ${res.status}).`); return }
      if (data.dna) setDna(data.dna as DnaOutput)
      setSelectedUserId('')
      await load()
    } catch {
      setError('Network error while computing — please try again.')
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
          <p className="text-sm text-gray-500 mt-1">Evidence-based financial aggregation from stored bank statement analyses</p>
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

      {dna && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">Financial DNA</h2>
            <span className="text-[10px] text-gray-400">{dna.snapshotsUsed} stored bank analysis/analyses used · every value carries its evidence source</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-4">Evidence-based aggregation — this is not a prediction and never a chance-of-approval figure.</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <DnaMoney label="Declared monthly income" v={dna.declaredMonthlyIncome} />
            <DnaMoney label="Observed recurring income" v={dna.observedMonthlyIncome} />
            <DnaMoney label="Closing balance" v={dna.closingBalance} />
            <DnaMoney label="Lowest balance" v={dna.lowestBalance} />
            <DnaMoney label="Average balance" v={dna.averageBalance} />
            <DnaMoney label="Estimated trip cost" v={dna.tripCost} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="border border-gray-100 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Income consistency</div>
              <div className="text-sm font-bold text-[#0B1F3A]">{dna.incomeConsistency.deltaPct != null ? `${dna.incomeConsistency.deltaPct}% delta` : '—'}</div>
              <div className="text-[10px] text-gray-400">{dna.incomeConsistency.note}</div>
            </div>
            <div className="border border-gray-100 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Balance trend</div>
              <div className="text-sm font-bold text-[#0B1F3A] capitalize">{dna.balanceTrend.direction ?? '—'}{dna.balanceTrend.deltaPct != null ? ` (${dna.balanceTrend.deltaPct > 0 ? '+' : ''}${dna.balanceTrend.deltaPct}%)` : ''}</div>
              <div className="text-[10px] text-gray-400">{dna.balanceTrend.note}</div>
            </div>
            <div className="border border-gray-100 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Funding coverage</div>
              <div className={`text-sm font-black ${dna.fundingCoverage.ratio == null ? 'text-gray-400' : dna.fundingCoverage.ratio >= 1.5 ? 'text-green-600' : dna.fundingCoverage.ratio >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                {dna.fundingCoverage.ratio != null ? `${dna.fundingCoverage.ratio}×` : 'Not computable'}
              </div>
              <div className="text-[10px] text-gray-400">
                {dna.fundingCoverage.note}
                {dna.fundingCoverage.fxRate ? ` FX ${dna.fundingCoverage.fxPair} @ ${dna.fundingCoverage.fxRate} (${dna.fundingCoverage.fxSource})` : ''}
              </div>
            </div>
          </div>
          {dna.reviewItems.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-2">Review items</div>
              <div className="space-y-2">
                {dna.reviewItems.map((r, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-800">{r.item}</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Evidence: {r.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
