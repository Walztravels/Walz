'use client'

import { useEffect, useState } from 'react'

interface DomainOverview {
  organicTraffic: number
  organicKeywords: number
  domainScore: number
  backlinks: number
}

interface Keyword {
  keyword: string
  position: number
  searchVolume: number
  url: string
  positionDelta: number | null
}

export function SEKeywordWidget() {
  const [overview, setOverview] = useState<DomainOverview | null>(null)
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/orbit/integrations/se-ranking/data')
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error)
        } else {
          setOverview(d.overview)
          setKeywords(d.keywords ?? [])
        }
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">SE Ranking — Keyword Positions</p>
        <p className="text-xs text-gray-600 animate-pulse">Loading keyword data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">SE Ranking — Keyword Positions</p>
        <p className="text-xs text-gray-600">
          {error.includes('not configured')
            ? 'Add your SE Ranking API key in Orbit Settings → Integrations.'
            : error}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">SE Ranking — Keyword Positions</h2>
          <span className="text-xs text-gray-500">Top 20 by traffic</span>
        </div>
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {[
              { label: 'Organic Traffic', value: overview.organicTraffic.toLocaleString(), color: 'text-green-400' },
              { label: 'Keywords', value: overview.organicKeywords.toLocaleString(), color: 'text-indigo-400' },
              { label: 'Domain Score', value: overview.domainScore.toString(), color: 'text-yellow-400' },
              { label: 'Backlinks', value: overview.backlinks.toLocaleString(), color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {keywords.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-500 text-sm">No keyword data returned.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500 uppercase">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Keyword</th>
                <th className="px-5 py-3 font-medium text-right">Position</th>
                <th className="px-5 py-3 font-medium text-right">Change</th>
                <th className="px-5 py-3 font-medium text-right">Volume</th>
                <th className="px-5 py-3 font-medium">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keywords.map((kw, i) => {
                const delta = kw.positionDelta
                const deltaLabel = delta == null ? '—' : delta === 0 ? '→' : delta > 0 ? `▼${delta}` : `▲${Math.abs(delta)}`
                const deltaColor = delta == null || delta === 0 ? 'text-gray-500' : delta > 0 ? 'text-red-400' : 'text-green-400'
                const posColor = kw.position <= 3 ? 'text-green-400' : kw.position <= 10 ? 'text-yellow-400' : 'text-gray-400'

                return (
                  <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3 text-gray-600 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-3 text-gray-200 max-w-xs truncate">{kw.keyword}</td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${posColor}`}>{kw.position}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${deltaColor}`}>{deltaLabel}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-400">
                      {kw.searchVolume > 0 ? kw.searchVolume.toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-indigo-400 max-w-xs truncate font-mono text-[10px]">
                      {kw.url ? kw.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
