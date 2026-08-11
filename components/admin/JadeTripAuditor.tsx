'use client'

import { useState } from 'react'

interface Finding {
  severity: 'critical' | 'warning' | 'info'
  field: string
  issue: string
  suggestion: string
}

interface AuditResult {
  score: number
  summary: string
  blocksSend: boolean
  findings: Finding[]
}

export function JadeTripAuditor({
  itinId,
  onBlocksSend,
}: {
  itinId: string
  onBlocksSend?: (blocked: boolean) => void
}) {
  const [result, setResult]   = useState<AuditResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/itineraries/${itinId}/audit`, { method: 'POST' })
      const data = await res.json() as AuditResult & { error?: string }
      if (!res.ok) { setError(data.error ?? 'Audit failed'); return }
      setResult(data)
      onBlocksSend?.(data.blocksSend)
    } catch {
      setError('Network error — could not run audit')
    } finally {
      setRunning(false)
    }
  }

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-green-400' : s >= 60 ? 'text-amber-400' : 'text-red-400'

  const scoreBg = (s: number) =>
    s >= 80 ? 'bg-green-500/10 border-green-500/20' : s >= 60 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'

  const sevIcon: Record<string, string> = {
    critical: '🔴',
    warning:  '🟡',
    info:     '🔵',
  }
  const sevLabel: Record<string, string> = {
    critical: 'Critical',
    warning:  'Warning',
    info:     'Note',
  }
  const sevTextColor: Record<string, string> = {
    critical: 'text-red-400',
    warning:  'text-amber-400',
    info:     'text-blue-400',
  }

  const criticals = result?.findings.filter(f => f.severity === 'critical') ?? []
  const warnings  = result?.findings.filter(f => f.severity === 'warning')  ?? []
  const infos     = result?.findings.filter(f => f.severity === 'info')     ?? []

  return (
    <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-sm">✨ Jade Trip Auditor</h3>
          <p className="text-white/40 text-xs mt-0.5">Checks for placeholder data, missing fields, and pricing errors before send.</p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 font-bold rounded-xl text-xs transition disabled:opacity-50"
        >
          {running
            ? <><span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin inline-block" /> Running…</>
            : result ? '↺ Re-run Audit' : 'Run Audit'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Score strip */}
          <div className={`rounded-xl border p-4 flex items-center justify-between ${scoreBg(result.score)}`}>
            <p className="text-white/80 text-sm">{result.summary}</p>
            <div className="flex-shrink-0 ml-4 text-right">
              <p className={`text-2xl font-bold ${scoreColor(result.score)}`}>{result.score}</p>
              <p className="text-white/30 text-[10px]">/ 100</p>
            </div>
          </div>

          {result.blocksSend && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs font-semibold">
              🚫 This itinerary has critical issues. Fix them before sending.
            </div>
          )}

          {/* Findings */}
          {result.findings.length === 0 && (
            <p className="text-green-400 text-xs text-center py-2">✅ No issues found — itinerary looks ready to send.</p>
          )}

          {[...criticals, ...warnings, ...infos].map((f, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span className="flex-shrink-0 mt-0.5">{sevIcon[f.severity] ?? '•'}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`font-bold uppercase text-[10px] tracking-wide ${sevTextColor[f.severity]}`}>
                    {sevLabel[f.severity]}
                  </span>
                  <span className="text-white/20 uppercase text-[10px] tracking-wide">{f.field}</span>
                </div>
                <p className="text-white/80">{f.issue}</p>
                <p className="text-white/40 mt-0.5">{f.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
