'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface AuditRow {
  id: string
  siteUrl: string
  status: string
  score: number | null
  pagesTotal: number | null
  pagesDone: number
  issuesCritical: number
  issuesHigh: number
  issuesMedium: number
  issuesLow: number
  triggeredBy: string | null
  createdAt: string
  completedAt: string | null
  error: string | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-300',
    running: 'bg-blue-900 text-blue-300 animate-pulse',
    complete: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  )
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500">—</span>
  const color = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`font-bold tabular-nums ${color}`}>{score}</span>
}

export default function AuditListPage() {
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchAudits() {
    try {
      const res = await fetch('/api/admin/orbit/audits')
      const data = await res.json()
      if (data.audits) setAudits(data.audits)
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAudits()
    // Poll while any audit is running
    const interval = setInterval(() => {
      if (audits.some((a) => a.status === 'running' || a.status === 'queued')) {
        fetchAudits()
      }
    }, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audits.length])

  async function launchAudit() {
    setLaunching(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/orbit/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create audit')
      await fetchAudits()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLaunching(false)
    }
  }

  const hasRunning = audits.some((a) => a.status === 'running' || a.status === 'queued')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Website Audits</h1>
          <p className="text-sm text-gray-400 mt-1">SEO health checks across the live site</p>
        </div>
        <button
          onClick={launchAudit}
          disabled={launching || hasRunning}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {launching ? 'Starting…' : hasRunning ? 'Audit running…' : 'Run New Audit'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>
        ) : audits.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-gray-400 text-sm">No audits yet.</p>
            <p className="text-gray-600 text-xs">Click "Run New Audit" to scan walztravels.com.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium">Pages</th>
                <th className="px-5 py-3 font-medium">Issues (C/H/M/L)</th>
                <th className="px-5 py-3 font-medium">Triggered by</th>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {audits.map((a) => (
                <tr key={a.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-5 py-3"><ScoreChip score={a.score} /></td>
                  <td className="px-5 py-3 tabular-nums text-gray-400">
                    {a.pagesDone}/{a.pagesTotal ?? '?'}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    <span className="text-red-400">{a.issuesCritical}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-orange-400">{a.issuesHigh}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-yellow-400">{a.issuesMedium}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-gray-400">{a.issuesLow}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs truncate max-w-[140px]">
                    {a.triggeredBy ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(a.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3">
                    {a.status === 'complete' && (
                      <Link href={`/admin/orbit/audit/${a.id}`} className="text-indigo-400 hover:underline text-xs">
                        View →
                      </Link>
                    )}
                    {a.status === 'failed' && (
                      <span className="text-red-400 text-xs" title={a.error ?? ''}>Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Audits run up to 60 pages in parallel batches. Score formula: 100 − (critical×15) − (high×8) − (medium×3) − (low×1), capped per severity.
      </p>
    </div>
  )
}
