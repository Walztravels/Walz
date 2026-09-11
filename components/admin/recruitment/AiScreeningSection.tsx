'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

/**
 * Advisory AI résumé screening for one application. A human triggers each
 * run and a human marks it reviewed. Results never move the pipeline and
 * never reject — the labels below say so to every user, every time.
 *
 * Hardened after the 2026-09-11 silent-failure incident: every fetch and
 * JSON parse is guarded (a non-JSON 500 used to kill the handler mid-air,
 * leaving the button stuck with no message), loading feedback is
 * immediate, a ref-based single-flight guard makes double-clicks free,
 * and every failure renders a visible message.
 */

interface ScreeningResult {
  id: string; status: string; summary: string | null
  strengths: string[]; concerns: string[]; suggestedQuestions: string[]
  matchScore: number | null; cvUsed: boolean; error: string | null
  model: string; requestedBy: string; reviewedBy: string | null
  reviewedAt: string | null; createdAt: string
}

/** Parse a response that may not be JSON (crash pages, gateway errors). */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try { return await res.json() as Record<string, unknown> } catch { return {} }
}

export default function AiScreeningSection({ applicationId }: { applicationId: string }) {
  const [results,  setResults]  = useState<ScreeningResult[]>([])
  const [error,    setError]    = useState('')
  const [notice,   setNotice]   = useState('')
  const [running,  setRunning]  = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [loadFail, setLoadFail] = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`)
      const data = await safeJson(res)
      if (res.ok) {
        setResults((data.results as ScreeningResult[] | undefined) ?? [])
        setLoadFail(false)
      } else {
        setLoadFail(true)
      }
    } catch {
      setLoadFail(true)
    }
  }, [applicationId])
  useEffect(() => { void load() }, [load])

  async function run() {
    // Single-flight: state alone isn't enough against double-clicks that
    // land before React re-renders the disabled button.
    if (inFlight.current) return
    inFlight.current = true
    setRunning(true); setError(''); setNotice('')
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`, { method: 'POST' })
      const data = await safeJson(res)
      if (!res.ok) {
        setError((data.message as string) ?? (data.error as string) ?? `Screening failed (HTTP ${res.status}). Please try again.`)
        return
      }
      // Surface exactly why CV text was or wasn't part of the run.
      if (data.cvStatus && data.cvStatus !== 'ok' && typeof data.cvMessage === 'string') {
        setNotice(data.cvMessage)
      }
      await load()   // the new result renders without a manual refresh
    } catch {
      setError('Network error while screening — please check your connection and try again.')
    } finally {
      inFlight.current = false
      setRunning(false)
    }
  }

  async function markReviewed(resultId: string) {
    setBusy(true); setError('')
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/ai-screening`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId }),
      })
      const data = await safeJson(res)
      if (!res.ok) {
        setError((data.message as string) ?? (data.error as string) ?? 'Failed to mark reviewed')
        return
      }
      await load()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const hasCompleted = results.some(r => r.status === 'completed')

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#C9A84C]" /> AI screening
          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">advisory only</span>
        </h2>
        <button onClick={() => void run()} disabled={running}
          className="text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1.5">
          {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {running ? 'Screening application…' : hasCompleted ? 'Run screening again' : 'Run AI screening'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        AI reviews the application against the stated job requirements only. It never rejects candidates,
        never moves the pipeline, and its output must be reviewed by a person. All hiring decisions are made by staff.
        {hasCompleted && ' Previous results stay below for audit history.'}
      </p>
      {running && (
        <p className="text-xs text-[#0B1F3A] bg-[#FFF8E6] border border-[#C9A84C]/30 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C9A84C]" /> Screening application… this usually takes a few seconds.
        </p>
      )}
      {error  && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{notice}</p>}
      {loadFail && !error && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Screening history could not be loaded — <button className="underline font-semibold" onClick={() => void load()}>retry</button>
        </p>
      )}

      {results.map(r => (
        <div key={r.id} className="border border-gray-100 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {r.status === 'running' ? (
              <span className="inline-flex items-center gap-1 text-[#0B1F3A] bg-[#FFF8E6] px-2 py-0.5 rounded-full font-semibold">
                <Loader2 className="w-3 h-3 animate-spin" /> in progress
              </span>
            ) : r.status === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                <AlertTriangle className="w-3 h-3" /> failed
              </span>
            ) : (
              <span className="font-bold text-[#0B1F3A]">
                Advisory match {r.matchScore !== null ? `${r.matchScore}/100` : '—'}
              </span>
            )}
            <span className="text-gray-400">{fmt(r.createdAt)} · run by {r.requestedBy}{r.status === 'completed' ? (r.cvUsed ? ' · CV text included' : ' · CV not machine-readable') : ''}</span>
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
