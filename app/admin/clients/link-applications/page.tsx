'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Link2, Search, Check, X, Loader2, Users, RefreshCw,
  ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type LinkRequest = {
  id: string
  userId: string
  userEmail: string
  applicationId: string
  applicationType: string
  applicationLabel: string | null
  status: string
  autoDetected: boolean
  detectedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  notes: string | null
}

type GroupedRequest = {
  userId: string
  userEmail: string
  detectedAt: string
  requests: LinkRequest[]
}

type UnlinkedApp = {
  id: string
  type: string
  label: string
  ref: string | null
  date: string
}

type SearchResult = {
  user: { id: string; name: string | null; email: string; createdAt: string } | null
  unlinked: UnlinkedApp[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    visa:  'bg-indigo-100 text-indigo-700',
    trip:  'bg-blue-100 text-blue-700',
    tour:  'bg-teal-100 text-teal-700',
  }
  const color = map[type?.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${color}`}>
      {type}
    </span>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function LinkApplicationsPage() {
  const [tab, setTab] = useState<'pending' | 'manual' | 'history'>('pending')

  // Requests
  const [requests, setRequests] = useState<LinkRequest[]>([])
  const [grouped,  setGrouped]  = useState<GroupedRequest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)

  // Expanded user groups in Pending tab
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Manual link state
  const [searchEmail,  setSearchEmail]  = useState('')
  const [searching,    setSearching]    = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [linking,      setLinking]      = useState(false)
  const [linkSuccess,  setLinkSuccess]  = useState(false)
  const [manualError,  setManualError]  = useState<string | null>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/link-requests')
      const data = await res.json() as { requests: LinkRequest[]; grouped: GroupedRequest[] }
      setRequests(data.requests ?? [])
      setGrouped(data.grouped ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ─────────────────────────────────────────────────────────────

  async function action(id: string, act: 'approve' | 'reject', notes?: string) {
    setActioning(id)
    try {
      await fetch(`/api/admin/link-requests/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: act, notes }),
      })
      await load()
    } finally {
      setActioning(null)
    }
  }

  async function approveAll(group: GroupedRequest) {
    const pending = group.requests.filter(r => r.status === 'pending')
    for (const r of pending) {
      setActioning(r.id)
      await fetch(`/api/admin/link-requests/${r.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'approve' }),
      })
    }
    setActioning(null)
    await load()
  }

  // ── Search ───────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!searchEmail.trim()) return
    setSearching(true)
    setSearchResult(null)
    setSelected(new Set())
    setLinkSuccess(false)
    setManualError(null)
    try {
      const res  = await fetch(`/api/admin/link-requests/search?email=${encodeURIComponent(searchEmail.trim())}`)
      const data = await res.json() as SearchResult
      setSearchResult(data)
    } catch {
      setManualError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function handleLink() {
    if (!searchResult?.user || selected.size === 0) return
    setLinking(true)
    setManualError(null)
    try {
      const apps = (searchResult.unlinked ?? []).filter(a => selected.has(a.id))
      for (const app of apps) {
        await fetch('/api/admin/link-requests', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            userId:           searchResult.user!.id,
            userEmail:        searchResult.user!.email,
            applicationId:    app.id,
            applicationType:  app.type,
            applicationLabel: app.label,
          }),
        })
      }
      setLinkSuccess(true)
      setSearchResult(null)
      setSearchEmail('')
      setSelected(new Set())
      await load()
    } catch {
      setManualError('Linking failed. Please try again.')
    } finally {
      setLinking(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const pendingCount  = requests.filter(r => r.status === 'pending').length
  const historyItems  = requests.filter(r => r.status === 'approved' || r.status === 'rejected')

  const toggleGroup = (userId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  const toggleApp = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Link2 className="w-6 h-6 text-[#C9A84C] flex-shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-[#0B1F3A]">Application Linking</h1>
          <p className="text-sm text-gray-500">Link unlinked applications to client portal accounts</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {pendingCount} pending
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors px-3 py-2 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {(['pending', 'manual', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white text-[#0B1F3A] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pending' ? 'Pending' : t === 'manual' ? 'Manual Link' : 'History'}
          </button>
        ))}
      </div>

      {/* ── TAB: Pending ─────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading link requests…
            </div>
          ) : grouped.filter(g => g.requests.some(r => r.status === 'pending')).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">All caught up — no pending links</p>
              <p className="text-gray-400 text-sm mt-1">New link requests will appear here automatically.</p>
            </div>
          ) : (
            grouped
              .filter(g => g.requests.some(r => r.status === 'pending'))
              .map(group => {
                const pendingReqs = group.requests.filter(r => r.status === 'pending')
                const isOpen      = expandedGroups.has(group.userId)

                return (
                  <div key={group.userId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.userId)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-amber-600 font-bold text-sm">
                          {group.userEmail[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#0B1F3A] text-sm truncate">{group.userEmail}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Detected {fmtDate(group.detectedAt)} · {pendingReqs.length} pending
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); approveAll(group) }}
                        disabled={actioning !== null}
                        className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 mr-2"
                      >
                        {actioning !== null ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve All
                      </button>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      }
                    </button>

                    {/* Expanded requests */}
                    {isOpen && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 space-y-2">
                        {pendingReqs.map(req => (
                          <div
                            key={req.id}
                            className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <TypeBadge type={req.applicationType} />
                                <span className="text-sm font-medium text-[#0B1F3A] truncate">
                                  {req.applicationLabel ?? req.applicationId}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400">Detected {fmtDate(req.detectedAt)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => action(req.id, 'approve')}
                                disabled={actioning !== null}
                                className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {actioning === req.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Check className="w-3 h-3" />
                                }
                                Approve
                              </button>
                              <button
                                onClick={() => action(req.id, 'reject')}
                                disabled={actioning !== null}
                                className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* ── TAB: Manual Link ─────────────────────────────────────────────────── */}
      {tab === 'manual' && (
        <div className="max-w-2xl space-y-4">
          {/* Search input */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-[#0B1F3A] text-sm mb-3">Search by email address</h2>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-[#C9A84C] focus-within:ring-1 focus-within:ring-[#C9A84C] transition-colors">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="flex-1 text-sm outline-none text-gray-800 placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !searchEmail.trim()}
                className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>
          </div>

          {/* Success banner */}
          {linkSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-medium">
              <Check className="w-4 h-4" />
              Applications linked successfully.
            </div>
          )}

          {/* Error banner */}
          {manualError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              <X className="w-4 h-4" />
              {manualError}
            </div>
          )}

          {/* Search result */}
          {searchResult && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* User card */}
              <div className="px-5 py-4 border-b border-gray-100">
                {searchResult.user ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#0B1F3A] font-bold text-sm">
                        {(searchResult.user.name ?? searchResult.user.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-[#0B1F3A] text-sm">
                        {searchResult.user.name ?? searchResult.user.email}
                      </p>
                      {searchResult.user.name && (
                        <p className="text-xs text-gray-400">{searchResult.user.email}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        Portal account joined {fmtDate(searchResult.user.createdAt)}
                      </p>
                    </div>
                    <span className="ml-auto text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                      Account found
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-gray-500">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-gray-700">No portal account found</p>
                      <p className="text-xs text-gray-400">This email has not registered on the client portal.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Unlinked apps */}
              {searchResult.user && (
                <div className="px-5 py-4">
                  {!searchResult.unlinked || searchResult.unlinked.length === 0 ? (
                    <p className="text-sm text-gray-400">No unlinked applications found for this email.</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Unlinked applications ({searchResult.unlinked.length})
                      </p>
                      <div className="space-y-2">
                        {searchResult.unlinked.map(app => (
                          <label
                            key={app.id}
                            className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                              selected.has(app.id)
                                ? 'border-[#C9A84C] bg-amber-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(app.id)}
                              onChange={() => toggleApp(app.id)}
                              className="accent-[#C9A84C] w-4 h-4 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <TypeBadge type={app.type} />
                                <span className="text-sm font-medium text-[#0B1F3A] truncate">{app.label}</span>
                              </div>
                              <p className="text-xs text-gray-400">
                                {app.ref ? `Ref: ${app.ref} · ` : ''}{fmtDate(app.date)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>

                      <button
                        onClick={handleLink}
                        disabled={selected.size === 0 || linking}
                        className="mt-4 flex items-center gap-2 bg-[#C9A84C] hover:bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
                      >
                        {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        Link Selected ({selected.size}) →
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: History ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading…
            </div>
          ) : historyItems.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No reviewed requests yet</p>
              <p className="text-gray-400 text-sm mt-1">Approved and rejected links will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Application</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Reviewed By</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyItems.map(req => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-700 max-w-[180px] truncate">{req.userEmail}</td>
                      <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">
                        {req.applicationLabel ?? req.applicationId}
                      </td>
                      <td className="px-5 py-3">
                        <TypeBadge type={req.applicationType} />
                      </td>
                      <td className="px-5 py-3">
                        {req.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                            <Check className="w-3 h-3" /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                            <X className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{req.reviewedBy ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {req.reviewedAt ? fmtDate(req.reviewedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
