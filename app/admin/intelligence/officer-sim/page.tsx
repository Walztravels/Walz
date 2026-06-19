'use client'

import { useState, useEffect, useCallback } from 'react'

interface SimSession {
  id: string
  applicationId: string
  staffId: string
  destination: string
  officerType: string
  resistanceScore: number
  completedAt: string
}

interface SimResult {
  resistanceScore: number
  weakestDoc: string
  objections: { objection: string; response: string }[]
  sessionNotes: string
}

const DESTINATIONS = ['uk', 'canada', 'usa', 'schengen', 'uae', 'australia']
const OFFICER_TYPES = ['strict_ecb', 'experienced_border', 'trainee_officer', 'senior_reviewer']

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'
const SELECT = INPUT

export default function OfficerSimPage() {
  const [sessions, setSessions] = useState<SimSession[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    applicationId: '',
    staffId: '',
    destination: 'uk',
    officerType: 'experienced_border',
    context: '',
  })
  const [simResult, setSimResult] = useState<SimResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/officer-sim')
      const data = await res.json()
      setSessions(data.sessions ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runSim(e: React.FormEvent) {
    e.preventDefault()
    setSimLoading(true)
    setSimResult(null)
    try {
      const res = await fetch('/api/admin/intelligence/officer-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      setSimResult(data.result ?? data)
      await load()
    } finally {
      setSimLoading(false)
    }
  }

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function resistanceBg(score: number) {
    if (score >= 75) return 'bg-red-100 text-red-700'
    if (score >= 50) return 'bg-amber-100 text-amber-700'
    return 'bg-green-100 text-green-700'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Immigration Officer Simulation</h1>
          <p className="text-sm text-gray-500 mt-1">Stress-test applications against AI officer personas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Run Simulation</h2>
            <form onSubmit={runSim} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Application ID</label>
                <input className={INPUT} value={form.applicationId} onChange={e => set('applicationId', e.target.value)} placeholder="app_..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Staff ID</label>
                <input className={INPUT} value={form.staffId} onChange={e => set('staffId', e.target.value)} placeholder="staff_..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Destination</label>
                  <select className={SELECT} value={form.destination} onChange={e => set('destination', e.target.value)}>
                    {DESTINATIONS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Officer Type</label>
                  <select className={SELECT} value={form.officerType} onChange={e => set('officerType', e.target.value)}>
                    {OFFICER_TYPES.map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Context (optional)</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] resize-none"
                  placeholder="Add any extra context about the application..."
                  value={form.context}
                  onChange={e => set('context', e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={simLoading || !form.applicationId.trim()}
                className="w-full h-10 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors"
              >
                {simLoading ? 'Running Simulation…' : 'Run Simulation'}
              </button>
            </form>
          </div>

          {simResult && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-[#0B1F3A]">Simulation Result</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-semibold">Resistance Score</span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${resistanceBg(simResult.resistanceScore)}`}>
                  {simResult.resistanceScore}/100
                </span>
              </div>
              {simResult.weakestDoc && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Weakest Document</p>
                  <p className="text-sm text-red-600 font-medium">{simResult.weakestDoc}</p>
                </div>
              )}
              {simResult.objections?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Objections</p>
                  <div className="space-y-2">
                    {simResult.objections.map((o, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-600 mb-1">{o.objection}</p>
                        <p className="text-xs text-gray-600">{o.response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {simResult.sessionNotes && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Session Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{simResult.sessionNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Past sessions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">Past Sessions</h2>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No sessions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Application</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dest.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Officer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resistance</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-gray-500 truncate max-w-[100px]">{s.applicationId}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[80px]">{s.staffId}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#0B1F3A] uppercase">{s.destination}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{s.officerType?.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${resistanceBg(s.resistanceScore)}`}>
                          {s.resistanceScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(s.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
