'use client'
import { useState, useEffect, useCallback } from 'react'

/**
 * Staff autocomplete selector (UX patch) — search by name or email,
 * internal staff ids resolved automatically and never displayed.
 */

export interface StaffRef {
  id: string
  name: string
  email: string
  role: string
  status: string
}

export default function StaffSelector({
  value, onSelect, label = 'Search Staff',
}: {
  value: StaffRef | null
  onSelect: (staff: StaffRef | null) => void
  label?: string
}) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<StaffRef[]>([])
  const [open,      setOpen]      = useState(false)
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res  = await fetch(`/api/admin/staff/search?q=${encodeURIComponent(q.trim())}`)
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

  return (
    <div className="relative">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{label}</label>
      {value ? (
        <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[#0B1F3A]">{value.name}</div>
            <div className="text-xs text-gray-600">{value.role}</div>
            <div className="text-xs text-gray-400">{value.email}</div>
          </div>
          <button onClick={() => onSelect(null)} className="text-xs font-semibold text-gray-400 hover:text-red-500 whitespace-nowrap">
            Change staff
          </button>
        </div>
      ) : (
        <>
          <input
            className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
            placeholder="Search by name or email…"
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
                <div className="px-4 py-3 text-xs text-gray-400">No staff members found.</div>
              )}
              {results.map(s => (
                <button key={s.id} onClick={() => { setQuery(''); setOpen(false); onSelect(s) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="text-sm font-semibold text-[#0B1F3A]">{s.name}</div>
                  <div className="text-xs text-gray-500">{s.email}</div>
                  <div className="text-xs text-gray-400">{s.role} · {s.status}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
