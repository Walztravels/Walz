'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Issue {
  id: string
  pageId: string | null
  severity: string
  checkName: string
  title: string
  description: string
  evidence: string | null
  fixPreview: string | null
  status: string
  approvedBy: string | null
  approvedAt: string | null
}

interface PageRow {
  id: string
  url: string
  statusCode: number | null
  title: string | null
  metaDescription: string | null
  h1Count: number
  inSitemap: boolean
}

interface Audit {
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
  pages: PageRow[]
  issues: Issue[]
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low']

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-900 text-red-300',
    high: 'bg-orange-900 text-orange-300',
    medium: 'bg-yellow-900 text-yellow-300',
    low: 'bg-gray-700 text-gray-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${map[severity] ?? 'bg-gray-700 text-gray-300'}`}>
      {severity}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: 'bg-gray-700 text-gray-300',
    running: 'bg-blue-900 text-blue-300',
    complete: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  )
}

export default function AuditDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'issues' | 'pages'>('issues')
  const [filterSev, setFilterSev] = useState<string>('all')

  async function fetchAudit() {
    try {
      const res = await fetch(`/api/admin/orbit/audits/${id}`)
      const data = await res.json()
      if (data.audit) setAudit(data.audit)
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!audit || audit.status === 'complete' || audit.status === 'failed') return
    const t = setTimeout(() => fetchAudit(), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit])

  if (loading) {
    return <div className="py-24 text-center text-gray-500 text-sm">Loading audit…</div>
  }

  if (!audit) {
    return (
      <div className="py-24 text-center">
        <p className="text-gray-400">Audit not found.</p>
        <Link href="/admin/orbit/audit" className="text-indigo-400 underline text-sm mt-2 inline-block">
          Back to audits
        </Link>
      </div>
    )
  }

  const visibleIssues = filterSev === 'all'
    ? audit.issues
    : audit.issues.filter((i) => i.severity === filterSev)

  const scoreColor = audit.score === null
    ? 'text-gray-400'
    : audit.score >= 80 ? 'text-green-400' : audit.score >= 50 ? 'text-yellow-400' : 'text-red-400'

  // Per-page issue counts derived from issues list
  const issueCounts = audit.issues.reduce<Record<string, Record<string, number>>>((acc, iss) => {
    if (!iss.pageId) return acc
    if (!acc[iss.pageId]) acc[iss.pageId] = { critical: 0, high: 0, medium: 0, low: 0 }
    acc[iss.pageId][iss.severity] = (acc[iss.pageId][iss.severity] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/admin/orbit/audit" className="text-gray-500 hover:text-white text-sm mt-1">
          ← Audits
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white truncate">{audit.siteUrl}</h1>
            <StatusChip status={audit.status} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(audit.createdAt).toLocaleString('en-GB')}
            {audit.triggeredBy && ` · by ${audit.triggeredBy}`}
          </p>
          {audit.error && (
            <p className="text-xs text-red-400 mt-1">{audit.error}</p>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-1 md:col-span-2">
          <p className="text-xs text-gray-500 mb-1">Score</p>
          <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
            {audit.score ?? '—'}
          </span>
          {audit.score !== null && <span className="text-gray-500 text-sm ml-1">/100</span>}
        </div>
        {[
          { label: 'Critical', value: audit.issuesCritical, color: 'text-red-400' },
          { label: 'High', value: audit.issuesHigh, color: 'text-orange-400' },
          { label: 'Medium', value: audit.issuesMedium, color: 'text-yellow-400' },
          { label: 'Low', value: audit.issuesLow, color: 'text-gray-400' },
        ].map((k) => (
          <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <span className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {(['issues', 'pages'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors capitalize ${
              activeTab === tab
                ? 'bg-gray-900 text-white border border-b-gray-900 border-gray-800'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab} {tab === 'issues' ? `(${audit.issues.length})` : `(${audit.pages.length})`}
          </button>
        ))}
      </div>

      {/* Issues tab */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', ...SEV_ORDER].map((sev) => {
              const count = sev === 'all'
                ? audit.issues.length
                : audit.issues.filter((i) => i.severity === sev).length
              return (
                <button
                  key={sev}
                  onClick={() => setFilterSev(sev)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    filterSev === sev
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {sev} ({count})
                </button>
              )
            })}
          </div>

          {visibleIssues.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl py-12 text-center text-gray-500 text-sm">
              {filterSev === 'all' ? 'No issues found — great work!' : `No ${filterSev} issues.`}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleIssues.map((issue) => (
                <div key={issue.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <SeverityBadge severity={issue.severity} />
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                      {issue.checkName.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 font-medium">{issue.title}</p>
                  <p className="text-xs text-gray-500">{issue.description}</p>
                  {issue.evidence && (
                    <p className="text-xs text-gray-500 font-mono bg-gray-950 rounded px-3 py-2 break-all">
                      {issue.evidence}
                    </p>
                  )}
                  {issue.fixPreview && (
                    <div className="text-xs text-green-400 font-mono bg-green-950/30 border border-green-900 rounded px-3 py-2 whitespace-pre-wrap">
                      {issue.fixPreview}
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                      issue.status === 'fix_applied' ? 'bg-green-900 text-green-400' :
                      issue.status === 'dismissed' ? 'bg-gray-700 text-gray-400' :
                      issue.status === 'task_created' ? 'bg-blue-900 text-blue-400' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {issue.status.replace(/_/g, ' ')}
                    </span>
                    {issue.approvedBy && (
                      <span className="text-xs text-gray-600">actioned by {issue.approvedBy}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pages tab */}
      {activeTab === 'pages' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {audit.pages.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No pages crawled yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500 uppercase">
                    <th className="px-4 py-3 font-medium">URL</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Sitemap</th>
                    <th className="px-4 py-3 font-medium">H1</th>
                    <th className="px-4 py-3 font-medium">Issues (C/H/M/L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {audit.pages.map((p) => {
                    const counts = issueCounts[p.id] ?? {}
                    return (
                      <tr key={p.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3 text-gray-300 max-w-xs truncate" title={p.url}>
                          {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={p.statusCode === 200 ? 'text-green-400' : 'text-red-400'}>
                            {p.statusCode ?? '?'}
                          </span>
                        </td>
                        <td className="px-4 py-3">{p.inSitemap ? '✓' : <span className="text-gray-600">✗</span>}</td>
                        <td className="px-4 py-3 tabular-nums text-gray-400">{p.h1Count}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className="text-red-400">{counts.critical ?? 0}</span>
                          <span className="text-gray-600 mx-1">/</span>
                          <span className="text-orange-400">{counts.high ?? 0}</span>
                          <span className="text-gray-600 mx-1">/</span>
                          <span className="text-yellow-400">{counts.medium ?? 0}</span>
                          <span className="text-gray-600 mx-1">/</span>
                          <span className="text-gray-400">{counts.low ?? 0}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
