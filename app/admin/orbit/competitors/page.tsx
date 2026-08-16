'use client'

import { useEffect, useState } from 'react'

interface Snapshot {
  organicTraffic: number | null; organicKeywords: number | null
  domainScore: number | null; backlinks: number | null
  topKeywords: { keyword: string; position: number; volume: number }[]
  recordedAt: string
}

interface Competitor {
  id: string; domain: string; name: string; active: boolean; createdAt: string
  snapshots: Snapshot[]
}

function fmtNum(n: number | null) {
  if (n === null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading]         = useState(true)
  const [snapshotting, setSnapshotting] = useState<string | null>(null)
  const [removing, setRemoving]       = useState<string | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [domain, setDomain]           = useState('')
  const [name, setName]               = useState('')
  const [adding, setAdding]           = useState(false)
  const [error, setError]             = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/orbit/competitors')
    const data = await res.json()
    if (data.competitors) setCompetitors(data.competitors)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addCompetitor(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) { setError('Domain is required'); return }
    setAdding(true); setError('')
    try {
      const res = await fetch('/api/admin/orbit/competitors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), name: name.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDomain(''); setName(''); setShowAdd(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setAdding(false) }
  }

  async function takeSnapshot(id: string) {
    setSnapshotting(id); setError('')
    try {
      const res = await fetch(`/api/admin/orbit/competitors/${id}/snapshot`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSnapshotting(null) }
  }

  async function removeCompetitor(id: string) {
    setRemoving(id)
    await fetch(`/api/admin/orbit/competitors/${id}`, { method: 'DELETE' })
    await load()
    setRemoving(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitors</h1>
          <p className="text-sm text-gray-400 mt-1">Track competitor organic performance using SE Ranking</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {showAdd ? 'Cancel' : '+ Add Competitor'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {showAdd && (
        <form onSubmit={addCompetitor} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Add Competitor</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Domain <span className="text-red-400">*</span></label>
              <input value={domain} onChange={e => setDomain(e.target.value)} required
                placeholder="e.g. travelsupermarket.com"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Display Name <span className="text-gray-600">(optional)</span></label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. TravelSupermarket"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Competitor data is fetched from SE Ranking. Respects robots.txt and rate limits. No competitor content is reproduced.
          </p>
          <button type="submit" disabled={adding}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {adding ? 'Adding…' : 'Add Competitor'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
      ) : competitors.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-gray-400 text-sm">No competitors tracked yet.</p>
          <p className="text-gray-600 text-xs">Add a competitor domain to start comparing organic performance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map(c => {
            const snap = c.snapshots[0]
            const isExpanded = expanded === c.id
            return (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-medium text-sm">{c.name}</p>
                      <a href={`https://${c.domain}`} target="_blank" rel="noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                        ↗ {c.domain}
                      </a>
                    </div>
                    {snap ? (
                      <p className="text-xs text-gray-500">
                        Last snapshot: {new Date(snap.recordedAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-600">No snapshot yet</p>
                    )}
                  </div>

                  {snap && (
                    <div className="flex gap-6 text-center">
                      <div>
                        <p className="text-lg font-bold text-white tabular-nums">{fmtNum(snap.organicTraffic)}</p>
                        <p className="text-xs text-gray-500">Traffic</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white tabular-nums">{fmtNum(snap.organicKeywords)}</p>
                        <p className="text-xs text-gray-500">Keywords</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white tabular-nums">{snap.domainScore?.toFixed(0) ?? '—'}</p>
                        <p className="text-xs text-gray-500">DA</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white tabular-nums">{fmtNum(snap.backlinks)}</p>
                        <p className="text-xs text-gray-500">Backlinks</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 shrink-0">
                    {snap && snap.topKeywords.length > 0 && (
                      <button onClick={() => setExpanded(isExpanded ? null : c.id)}
                        className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1">
                        {isExpanded ? 'Hide keywords ↑' : 'Top keywords ↓'}
                      </button>
                    )}
                    <button onClick={() => takeSnapshot(c.id)} disabled={snapshotting === c.id}
                      className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                      {snapshotting === c.id ? 'Fetching…' : 'Update'}
                    </button>
                    <button onClick={() => removeCompetitor(c.id)} disabled={removing === c.id}
                      className="text-red-500 hover:text-red-300 text-xs transition-colors">
                      Remove
                    </button>
                  </div>
                </div>

                {isExpanded && snap && snap.topKeywords.length > 0 && (
                  <div className="border-t border-gray-800 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Top Keywords (SE Ranking data, not reproduced content)</p>
                    <div className="flex flex-wrap gap-2">
                      {snap.topKeywords.map((kw, i) => (
                        <div key={i} className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-white font-mono">{kw.keyword}</span>
                          <span className="text-gray-500 ml-2">pos {kw.position}</span>
                          {kw.volume > 0 && <span className="text-gray-600 ml-1">· {fmtNum(kw.volume)} vol</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
