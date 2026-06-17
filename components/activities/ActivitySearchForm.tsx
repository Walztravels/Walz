'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Loader2, MapPin } from 'lucide-react'

interface Destination { code: string; name: string; countryCode?: string }

export interface ActivitySearchParams {
  destinationCode: string
  destinationName: string
  from: string
  to: string
  adults: number
  children: number
}

interface Props {
  onSearch: (p: ActivitySearchParams) => void
  loading?: boolean
  dark?: boolean
}

function todayPlus(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function ActivitySearchForm({ onSearch, loading = false, dark = false }: Props) {
  const inp  = dark
    ? 'w-full bg-white/8 border border-white/15 text-white placeholder-white/35 rounded-xl pl-9 pr-3 py-3 text-sm outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]'
    : 'w-full border border-walz-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-walz-gold'
  const dateInp = dark
    ? 'w-full bg-white/8 border border-white/15 text-white rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]'
    : 'w-full border border-walz-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-walz-gold'
  const numInp  = dark
    ? 'w-full bg-white/8 border border-white/15 text-white rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]'
    : 'w-full border border-walz-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-walz-gold'
  const labelCls = dark ? 'block text-xs font-medium text-white/50 mb-1.5' : 'block text-xs font-medium text-walz-muted mb-1'
  const wrapCls  = dark
    ? 'bg-[#0B1F3A]/70 backdrop-blur-md border border-white/12 rounded-2xl p-5 space-y-4'
    : 'bg-white rounded-2xl shadow-sm border border-walz-border p-5 space-y-4'
  const dropdownCls = dark
    ? 'absolute z-50 w-full bg-[#0d2347] border border-white/15 rounded-xl shadow-2xl mt-1 overflow-hidden'
    : 'absolute z-50 w-full bg-white border border-walz-border rounded-xl shadow-xl mt-1 overflow-hidden'
  const dropItemCls = dark
    ? 'w-full text-left px-4 py-2.5 text-sm hover:bg-white/8 flex items-center justify-between border-b border-white/5 last:border-0'
    : 'w-full text-left px-4 py-2.5 text-sm hover:bg-walz-gold/10 flex items-center justify-between'
  const dropNameCls = dark ? 'text-white font-medium' : 'text-walz-deep-navy font-medium'
  const dropCodeCls = dark ? 'text-white/40 text-xs' : 'text-walz-muted text-xs'
  const [query,    setQuery]    = useState('')
  const [dest,     setDest]     = useState<Destination | null>(null)
  const [suggs,    setSuggs]    = useState<Destination[]>([])
  const [open,     setOpen]     = useState(false)
  const [fetching, setFetching] = useState(false)
  const [from,     setFrom]     = useState(todayPlus(30))
  const [to,       setTo]       = useState(todayPlus(33))
  const [adults,   setAdults]   = useState(2)
  const [children, setChildren] = useState(0)
  const [error,    setError]    = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function fetchSuggs(q: string) {
    if (q.length < 2) { setSuggs([]); return }
    setFetching(true)
    try {
      const res  = await fetch(`/api/hotelbeds/destinations?query=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSuggs(data.results ?? [])
      setOpen(true)
    } finally { setFetching(false) }
  }

  function handleInput(v: string) {
    setQuery(v); setDest(null)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchSuggs(v), 280)
  }

  function select(d: Destination) {
    setDest(d); setQuery(d.name); setOpen(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (!dest) { setError('Please select a destination from the list.'); return }
    if (!from || !to) { setError('Please select from and to dates.'); return }
    if (new Date(to) < new Date(from)) { setError('End date must be on or after start date.'); return }
    onSearch({ destinationCode: dest.code, destinationName: dest.name, from, to, adults, children })
  }

  return (
    <form onSubmit={handleSubmit} className={wrapCls}>
      {/* Destination */}
      <div ref={wrapRef} className="relative">
        <label className={labelCls}>Destination</label>
        <div className="relative">
          <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dark ? 'text-white/35' : 'text-walz-muted'}`} />
          <input
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => suggs.length > 0 && setOpen(true)}
            placeholder="City or destination…"
            className={inp}
          />
          {fetching && <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin ${dark ? 'text-white/35' : 'text-walz-muted'}`} />}
        </div>
        {open && suggs.length > 0 && (
          <ul className={dropdownCls}>
            {suggs.map(d => (
              <li key={d.code}>
                <button type="button" onClick={() => select(d)} className={dropItemCls}>
                  <span className={dropNameCls}>{d.name}</span>
                  <span className={dropCodeCls}>{d.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>From</label>
          <input type="date" value={from} min={todayPlus(1)} onChange={e => setFrom(e.target.value)} className={dateInp} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={dateInp} />
        </div>
      </div>

      {/* Pax */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className={labelCls}>Adults</label>
          <input type="number" min={1} max={20} value={adults}
            onChange={e => setAdults(Math.max(1, Number(e.target.value)))} className={numInp} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Children</label>
          <input type="number" min={0} max={10} value={children}
            onChange={e => setChildren(Math.max(0, Number(e.target.value)))} className={numInp} />
        </div>
      </div>

      {error && (
        <p className={`text-xs rounded-xl px-3 py-2 ${dark ? 'text-red-300 bg-red-900/20 border border-red-500/25' : 'text-red-600 bg-red-50 border border-red-200'}`}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#d4b05a] active:scale-[0.98] text-[#0B1F3A] font-bold px-6 py-3.5 rounded-xl disabled:opacity-50 transition-all duration-200"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {loading ? 'Searching…' : 'Search Activities'}
      </button>
    </form>
  )
}
