'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface KeywordGroup {
  id: string; name: string; topic: string; intent: string
  _count: { keywords: number }
}

interface Keyword {
  id: string; keyword: string; intent: string; country: string
  source: string; linkedPageSlug: string | null; volume: number | null
  currentPosition: number | null; previousPosition: number | null
  bestPosition: number | null; movement: number | null
  latestRanking: { clicks: number | null; impressions: number | null } | null
  group: { id: string; name: string } | null
}

interface Opportunity {
  id: string; keyword: string; position: number | null
  impressions: number | null; url: string | null
}

interface Cannibalization {
  pageSlug: string
  keywords: { id: string; keyword: string; position: number | null; intent: string }[]
}

const INTENT_COLORS: Record<string, string> = {
  informational: 'bg-blue-900/50 text-blue-300',
  navigational:  'bg-gray-700 text-gray-300',
  transactional: 'bg-green-900/50 text-green-300',
  commercial:    'bg-orange-900/50 text-orange-300',
}

function MovementBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-600">—</span>
  if (v === 0)  return <span className="text-gray-500">—</span>
  return v > 0
    ? <span className="text-green-400 text-xs">↑{v.toFixed(0)}</span>
    : <span className="text-red-400 text-xs">↓{Math.abs(v).toFixed(0)}</span>
}

export default function KeywordsPage() {
  const [tab, setTab]         = useState<'keywords' | 'groups' | 'opportunities'>('keywords')
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [groups, setGroups]   = useState<KeywordGroup[]>([])
  const [opps, setOpps]       = useState<{ nearPageOne: Opportunity[]; cannibalization: Cannibalization[]; unassigned: Opportunity[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [filterGroup, setFilterGroup] = useState('')
  const [filterIntent, setFilterIntent] = useState('')
  const [addKw, setAddKw]     = useState('')
  const [addGroup, setAddGroup] = useState('')
  const [addTopic, setAddTopic] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [showAddGroup, setShowAddGroup] = useState(false)

  async function load() {
    setLoading(true)
    const [kwRes, grpRes] = await Promise.all([
      fetch(`/api/admin/orbit/keywords?${filterGroup ? `groupId=${filterGroup}` : ''}${filterIntent ? `&intent=${filterIntent}` : ''}`),
      fetch('/api/admin/orbit/keywords/groups'),
    ])
    const [kwData, grpData] = await Promise.all([kwRes.json(), grpRes.json()])
    if (kwData.keywords)  setKeywords(kwData.keywords)
    if (grpData.groups)   setGroups(grpData.groups)
    setLoading(false)
  }

  async function loadOpps() {
    const res = await fetch('/api/admin/orbit/keywords/opportunities')
    const data = await res.json()
    setOpps(data)
  }

  useEffect(() => { load() }, [filterGroup, filterIntent])
  useEffect(() => { if (tab === 'opportunities' && !opps) loadOpps() }, [tab])

  async function importFromGsc() {
    setImporting(true); setImportResult(null)
    try {
      const res = await fetch('/api/admin/orbit/keywords/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 28 }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(`Imported ${data.imported} keywords (${data.skipped} skipped)`)
      await load()
    } catch (e) {
      setImportResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  async function addKeyword() {
    if (!addKw.trim()) return
    await fetch('/api/admin/orbit/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: addKw.trim() }),
    })
    setAddKw('')
    await load()
  }

  async function createGroup() {
    if (!addGroup.trim() || !addTopic.trim()) return
    setAddingGroup(true)
    await fetch('/api/admin/orbit/keywords/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addGroup.trim(), topic: addTopic.trim() }),
    })
    setAddGroup(''); setAddTopic(''); setShowAddGroup(false); setAddingGroup(false)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Keywords</h1>
          <p className="text-sm text-gray-400 mt-1">Research, tracking, and opportunities</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={importFromGsc}
            disabled={importing}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {importing ? 'Importing…' : 'Import from GSC'}
          </button>
          <Link href="/admin/orbit/content/new" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            New Brief →
          </Link>
        </div>
      </div>

      {importResult && (
        <div className={`text-sm rounded-lg px-4 py-2 ${importResult.startsWith('Error') ? 'bg-red-950 border border-red-800 text-red-300' : 'bg-green-950 border border-green-800 text-green-300'}`}>
          {importResult}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(['keywords', 'groups', 'opportunities'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium capitalize transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Keywords tab */}
      {tab === 'keywords' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All groups</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filterIntent} onChange={e => setFilterIntent(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">All intent</option>
              <option value="informational">Informational</option>
              <option value="navigational">Navigational</option>
              <option value="transactional">Transactional</option>
              <option value="commercial">Commercial</option>
            </select>
            <div className="flex gap-2 ml-auto">
              <input value={addKw} onChange={e => setAddKw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKeyword()}
                placeholder="Add keyword…"
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              <button onClick={addKeyword} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">Add</button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>
            ) : keywords.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-gray-400 text-sm">No keywords yet.</p>
                <p className="text-gray-600 text-xs">Import from Google Search Console or add manually.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 font-medium">Keyword</th>
                    <th className="px-4 py-3 font-medium">Intent</th>
                    <th className="px-4 py-3 font-medium">Group</th>
                    <th className="px-4 py-3 font-medium text-right">Pos.</th>
                    <th className="px-4 py-3 font-medium text-right">Δ</th>
                    <th className="px-4 py-3 font-medium text-right">Best</th>
                    <th className="px-4 py-3 font-medium text-right">Clicks</th>
                    <th className="px-4 py-3 font-medium text-right">Impr.</th>
                    <th className="px-4 py-3 font-medium">Page</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {keywords.map(kw => (
                    <tr key={kw.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-white font-mono text-xs">{kw.keyword}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${INTENT_COLORS[kw.intent] ?? 'bg-gray-700 text-gray-300'}`}>
                          {kw.intent.slice(0, 4)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{kw.group?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                        {kw.currentPosition !== null ? kw.currentPosition.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right"><MovementBadge v={kw.movement} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 text-xs">
                        {kw.bestPosition !== null ? kw.bestPosition.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                        {kw.latestRanking?.clicks ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                        {kw.latestRanking?.impressions ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[120px]">
                        {kw.linkedPageSlug ? (
                          <a href={`/blog/${kw.linkedPageSlug}`} target="_blank" rel="noreferrer"
                            className="text-indigo-400 hover:underline">/{kw.linkedPageSlug}</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Groups tab */}
      {tab === 'groups' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddGroup(v => !v)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {showAddGroup ? 'Cancel' : '+ New Group'}
            </button>
          </div>
          {showAddGroup && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">New Keyword Group</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Group name</label>
                  <input value={addGroup} onChange={e => setAddGroup(e.target.value)} placeholder="e.g. UK Visa Keywords"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Topic</label>
                  <input value={addTopic} onChange={e => setAddTopic(e.target.value)} placeholder="e.g. UK Visa"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button onClick={createGroup} disabled={addingGroup || !addGroup.trim() || !addTopic.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {addingGroup ? 'Creating…' : 'Create group'}
              </button>
            </div>
          )}
          <div className="grid gap-3">
            {groups.map(g => (
              <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">{g.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Topic: {g.topic} · {g._count.keywords} keywords</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${INTENT_COLORS[g.intent] ?? 'bg-gray-700 text-gray-300'}`}>
                  {g.intent}
                </span>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="py-12 text-center text-gray-500 text-sm">No groups yet. Create your first group to organise keywords by topic.</div>
            )}
          </div>
        </div>
      )}

      {/* Opportunities tab */}
      {tab === 'opportunities' && (
        <div className="space-y-6">
          {!opps ? (
            <div className="py-12 text-center text-gray-500 text-sm">Loading opportunities…</div>
          ) : (
            <>
              <section>
                <h2 className="text-sm font-semibold text-white mb-3">
                  Near Page 1 <span className="text-gray-500 font-normal">(positions 11–20)</span>
                </h2>
                {opps.nearPageOne.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    No near-page-1 keywords found. Import from GSC and track rankings first.
                  </p>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                          <th className="px-4 py-3 font-medium">Keyword</th>
                          <th className="px-4 py-3 font-medium text-right">Position</th>
                          <th className="px-4 py-3 font-medium text-right">Impressions</th>
                          <th className="px-4 py-3 font-medium">URL</th>
                          <th className="px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {opps.nearPageOne.map(o => (
                          <tr key={o.id} className="hover:bg-gray-800/40">
                            <td className="px-4 py-2.5 font-mono text-xs text-white">{o.keyword}</td>
                            <td className="px-4 py-2.5 text-right text-yellow-400 tabular-nums">{o.position?.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{o.impressions ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[180px]">{o.url ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <Link href={`/admin/orbit/content/new?keyword=${encodeURIComponent(o.keyword)}`}
                                className="text-indigo-400 hover:underline text-xs whitespace-nowrap">
                                Create brief →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-sm font-semibold text-white mb-3">
                  Cannibalization <span className="text-gray-500 font-normal">(multiple keywords targeting same page)</span>
                </h2>
                {opps.cannibalization.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">No cannibalization detected.</p>
                ) : (
                  <div className="space-y-3">
                    {opps.cannibalization.map(c => (
                      <div key={c.pageSlug} className="bg-gray-900 border border-orange-900/50 rounded-xl p-4">
                        <p className="text-xs font-medium text-orange-300 mb-2">/{c.pageSlug}</p>
                        <div className="flex flex-wrap gap-2">
                          {c.keywords.map(k => (
                            <div key={k.id} className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs">
                              <span className="text-white font-mono">{k.keyword}</span>
                              {k.position && <span className="text-gray-500 ml-2">pos {k.position.toFixed(1)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-sm font-semibold text-white mb-3">
                  Unassigned <span className="text-gray-500 font-normal">(ranking keywords with no page or brief)</span>
                </h2>
                {opps.unassigned.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">All keywords have associated pages or briefs.</p>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
                          <th className="px-4 py-3 font-medium">Keyword</th>
                          <th className="px-4 py-3 font-medium text-right">Position</th>
                          <th className="px-4 py-3 font-medium text-right">Impressions</th>
                          <th className="px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {opps.unassigned.map(o => (
                          <tr key={o.id} className="hover:bg-gray-800/40">
                            <td className="px-4 py-2.5 font-mono text-xs text-white">{o.keyword}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{o.position?.toFixed(1) ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{o.impressions ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <Link href={`/admin/orbit/content/new?keyword=${encodeURIComponent(o.keyword)}`}
                                className="text-indigo-400 hover:underline text-xs whitespace-nowrap">
                                Create brief →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
