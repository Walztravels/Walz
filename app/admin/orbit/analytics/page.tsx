'use client'

import { useEffect, useState } from 'react'

interface AnalyticsTotals {
  clicks: number; impressions: number; avgPosition: number | null; avgCtr: number | null
  sessions: number; conversions: number; spend: number
  rows: { pageUrl: string; source: string; clicks: number; impressions: number; ctr: number | null; position: number | null }[]
}

interface SyncResult { synced?: number; skipped?: number; emptyState?: boolean; message?: string; error?: string }

const SOURCE_LABELS: Record<string, string> = {
  gsc:        'Google Search Console',
  ga4:        'Google Analytics 4',
  meta_ads:   'Meta Ads',
  google_ads: 'Google Ads',
}

const SOURCE_COLORS: Record<string, string> = {
  gsc:        'text-blue-400',
  ga4:        'text-orange-400',
  meta_ads:   'text-indigo-400',
  google_ads: 'text-green-400',
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData]           = useState<AnalyticsTotals | null>(null)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})
  const [filterSource, setFilterSource] = useState('')
  const [days, setDays]           = useState(28)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ days: String(days) })
    if (filterSource) params.set('source', filterSource)
    try {
      const res = await fetch(`/api/admin/orbit/analytics?${params}`)
      const json = await res.json()
      if (!res.ok) { setData(null); return }
      setData(json)
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days, filterSource])

  async function sync(source: string) {
    setSyncing(source)
    try {
      const res = await fetch('/api/admin/orbit/analytics/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, days }),
      })
      const result: SyncResult = await res.json()
      setSyncResults(p => ({ ...p, [source]: result }))
      if (!result.emptyState) await load()
    } finally { setSyncing(null) }
  }

  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const fmtPct = (n: number | null | undefined) => n != null ? `${(n * 100).toFixed(1)}%` : '—'
  const fmtPos = (n: number | null | undefined) => n != null ? n.toFixed(1) : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Organic traffic, keyword performance, and paid data where connected</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Metric cards */}
      {loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : !data ? (
        <div className="py-12 text-center text-gray-500 text-sm">No data yet. Sync a source below.</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <MetricCard label="Clicks" value={fmtNum(data.clicks)} />
          <MetricCard label="Impressions" value={fmtNum(data.impressions)} />
          <MetricCard label="Avg Position" value={fmtPos(data.avgPosition)} />
          <MetricCard label="Avg CTR" value={fmtPct(data.avgCtr)} />
        </div>
      )}

      {/* Sync panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm font-semibold text-white mb-4">Data Sources</p>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(SOURCE_LABELS).map(([source, label]) => {
            const result = syncResults[source]
            return (
              <div key={source} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${SOURCE_COLORS[source] ?? 'text-white'}`}>{label}</p>
                  {result ? (
                    result.emptyState ? (
                      <p className="text-xs text-gray-500 mt-0.5">{result.message}</p>
                    ) : result.error ? (
                      <p className="text-xs text-red-400 mt-0.5">{result.error}</p>
                    ) : (
                      <p className="text-xs text-green-400 mt-0.5">Synced {result.synced} rows</p>
                    )
                  ) : (
                    <p className="text-xs text-gray-600 mt-0.5">
                      {source === 'gsc' ? 'Connect in Settings → Integrations' : 'Not yet connected'}
                    </p>
                  )}
                </div>
                <button onClick={() => sync(source)} disabled={syncing === source}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0">
                  {syncing === source ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top pages table */}
      {data && data.rows.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-white mb-3">Top Pages</p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 font-medium">Page</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium text-right">Clicks</th>
                  <th className="px-4 py-3 font-medium text-right">Impr.</th>
                  <th className="px-4 py-3 font-medium text-right">CTR</th>
                  <th className="px-4 py-3 font-medium text-right">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-xs text-indigo-300 font-mono truncate max-w-[280px]">
                      <a href={row.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">{row.pageUrl}</a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${SOURCE_COLORS[row.source] ?? 'text-gray-400'}`}>
                        {row.source.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300 text-xs">{row.clicks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 text-xs">{row.impressions}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 text-xs">{fmtPct(row.ctr)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 text-xs">{fmtPos(row.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
