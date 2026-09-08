'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * Advisory AI résumé screening for one application. A human triggers each
 * run and a human marks it reviewed. Results never move the pipeline and
 * never reject — the labels below say so to every user, every time.
 */

interface ScreeningResult {
  id: string; status: string; summary: string | null
  strengths: string[]; concerns: string[]; suggestedQuestions: string[]
  matchScore: number | null; cvUsed: boolean; error: string | null
  model: string; requestedBy: string; reviewedBy: string | null
  reviewedAt: string | null; createdAt: string
}

export default function AiScreeningSection({ applicationId }: { applicationId: string }) {
  const [results, setResults] = useState<ScreeningResult[]>([])
  const [error,   setError]   = useState('')
  const [running, setRunning] = useState(false)
  const [busy,    setBusy]    = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`)
      const data = await res.json()
      if (res.ok) setResults(data.results ?? [])
    } catch { /* section stays empty on network failure */ }
  }, [applicationId])
  useEffect(() => { void load() }, [load])

  async function run() {
    setRunning(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`, { method: 'POST' })
    const data = await res.json()
    setRunning(false)
    if (!res.ok) { setError(data.error ?? 'Screening failed'); return }
    await load()
  }

  async function markReviewed(resultId: string) {
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultId }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    await load()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#C9A84C]" /> AI screening
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">advisory only</span>
        </h2>
        <button onClick={() => void run()} disabled={running}
          className="text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg disabled:opacity-40">
          {running ? 'Screening…' : 'Run AI screening'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        AI reviews the application against the stated job requirements only. It never rejects candidates,
        never moves the pipeline, and its output must be reviewed by a person. All hiring decisions are made by staff.
      </p>
      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {results.map(r => (
        <div key={r.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {r.status === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                <AlertTriangle className="w-3 h-3" /> failed
              </span>
            ) : (
              <span className="font-bold text-[#0B1F3A]">
                Advisory match {r.matchScore !== null ? `${r.matchScore}/100` : '—'}
              </span>
            )}
            <span className="text-gray-400">{fmt(r.createdAt)} · run by {r.requestedBy}{r.cvUsed ? ' · CV text included' : ' · CV not machine-readable'}</span>
            {r.reviewedBy ? (
              <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle2 className="w-3 h-3" /> reviewed by {r.reviewedBy}
              </span>
            ) : r.status === 'completed' && (
              <button onClick={() => void markReviewed(r.id)} disabled={busy}
                className="font-semibold text-[#C9A84C] hover:underline disabled:opacity-40">
                Mark as reviewed by me
              </button>
            )}
          </div>
          {r.status === 'failed' && r.error && <p className="text-xs text-gray-500">{r.error}</p>}
          {r.summary && <p className="text-sm text-gray-600 whitespace-pre-wrap">{r.summary}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {r.strengths.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-green-700">Strengths</p>
                <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
                  {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {r.concerns.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-amber-700">Gaps vs requirements</p>
                <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
                  {r.concerns.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
          {r.suggestedQuestions.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#0B1F3A]">Suggested interview questions</p>
              <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
                {r.suggestedQuestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
