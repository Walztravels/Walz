'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getActiveCase, setActiveCase, type ActiveCaseRef } from '@/lib/intelligence/active-case-client'

/**
 * Shared client/case selector for the Intelligence Hub (UX patch).
 *
 * Staff search by name, WALZ reference, email or phone — never database
 * ids. Internal ids are resolved automatically and never displayed.
 * Adopts the cross-page Active Case by default so one selection follows
 * staff across the hub. Built for: Financial DNA, Officer Simulation,
 * Readiness, Document Intelligence, Lifecycle, Conversation Intelligence.
 */

const regionName = (iso2: string | null) => {
  if (!iso2) return null
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2.toUpperCase()) ?? iso2.toUpperCase() }
  catch { return iso2.toUpperCase() }
}
const statusLabel = (s: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null

export function caseSummary(c: ActiveCaseRef): string {
  return [regionName(c.destinationIso2), statusLabel(c.status)].filter(Boolean).join(' · ')
}

export default function IntelligenceCaseSelector({
  value, onSelect, autoAdoptActiveCase = true, label = 'Search Client or Application',
}: {
  value: ActiveCaseRef | null
  onSelect: (ref: ActiveCaseRef | null) => void
  autoAdoptActiveCase?: boolean
  label?: string
}) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<ActiveCaseRef[]>([])
  const [open,    setOpen]    = useState(false)
  const [searching, setSearching] = useState(false)
  const adopted = useRef(false)

  // Adopt the cross-page Active Case once, so staff don't reselect.
  useEffect(() => {
    if (!autoAdoptActiveCase || adopted.current || value) return
    adopted.current = true
    const shared = getActiveCase()
    if (shared) onSelect(shared)
  }, [autoAdoptActiveCase, value, onSelect])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res  = await fetch(`/api/admin/intelligence/client-search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json().catch(() => ({}))
      setResults(res.ok && Array.isArray(data.results) ? data.results : [])
      setOpen(true)
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const select = (r: ActiveCaseRef) => {
    setQuery(''); setOpen(false)
    setActiveCase(r)          // follows staff across the hub
    onSelect(r)
  }
  const clear = () => {
    setActiveCase(null)
    onSelect(null)
  }

  return (
    <div className="relative">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{label}</label>
      {value ? (
        <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#0B1F3A]">{value.clientName}</div>
            <div className="text-xs text-gray-600">
              {value.referenceNumber ?? 'No application yet'}
              {caseSummary(value) ? ` · ${caseSummary(value)}` : ''}
            </div>
            {value.email && <div className="text-xs text-gray-400">{value.email}</div>}
          </div>
          <button onClick={clear} className="text-xs font-semibold text-gray-400 hover:text-red-500 whitespace-nowrap">
            Change client
          </button>
        </div>
      ) : (
        <>
          <input
            className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
            placeholder="Search by name, WALZ reference, email or phone…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => query.trim().length >= 2 && setOpen(true)}
          />
          {open && (
            <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-64 overflow-y-auto">
              {searching && results.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-400">Searching…</div>
              )}
              {!searching && results.length === 0 && query.trim().length >= 2 && (
                <div className="px-4 py-3 text-xs text-gray-400">No clients or applications found.</div>
              )}
              {results.map((r, i) => (
                <button key={r.applicationId ?? r.userId ?? i} onClick={() => select(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="text-sm font-semibold text-[#0B1F3A]">{r.clientName}</div>
                  <div className="text-xs text-gray-500">
                    {r.referenceNumber ?? 'No application'}
                    {caseSummary(r) ? ` · ${caseSummary(r)}` : ''}
                  </div>
                  {r.email && <div className="text-xs text-gray-400">{r.email}</div>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
