'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { ALL_COUNTRIES, Country } from '@/lib/countries'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (iso2: string) => void
  placeholder?: string
  label?: string
  exclude?: string
  className?: string
}

export function CountrySelect({ value, onChange, placeholder = 'Select country', label, exclude, className }: Props) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = ALL_COUNTRIES.filter(c =>
    c.iso2 !== exclude &&
    (c.name.toLowerCase().includes(query.toLowerCase()) || c.iso2.toLowerCase().includes(query.toLowerCase()))
  )

  const selected = ALL_COUNTRIES.find(c => c.iso2 === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{label}</label>}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all',
          'bg-white/10 border-white/20 text-white hover:bg-white/15 hover:border-white/30',
          open && 'border-[#C9A84C] ring-2 ring-[#C9A84C]/20',
        )}
      >
        {selected ? (
          <>
            <span className="text-2xl leading-none flex-shrink-0">{selected.flag}</span>
            <span className="flex-1 font-medium text-sm">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-white/40 text-sm">{placeholder}</span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[#0B1F3A] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search countries…"
                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-white/40" />
                </button>
              )}
            </div>
          </div>
          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-white/30 text-sm">No countries found</div>
            ) : filtered.map(c => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => { onChange(c.iso2); setOpen(false); setQuery('') }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/10',
                  c.iso2 === value && 'bg-[#C9A84C]/20 text-[#C9A84C]',
                )}
              >
                <span className="text-xl leading-none flex-shrink-0">{c.flag}</span>
                <span className={cn('flex-1 font-medium', c.iso2 === value ? 'text-[#C9A84C]' : 'text-white')}>{c.name}</span>
                <span className="text-xs text-white/30 font-mono">{c.iso2}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Light variant for use on white backgrounds
export function CountrySelectLight({ value, onChange, placeholder = 'Select country', label, exclude, className }: Props) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = ALL_COUNTRIES.filter(c =>
    c.iso2 !== exclude &&
    (c.name.toLowerCase().includes(query.toLowerCase()) || c.iso2.toLowerCase().includes(query.toLowerCase()))
  )
  const selected = ALL_COUNTRIES.find(c => c.iso2 === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 h-12 rounded-xl border text-left transition-all bg-white',
          open ? 'border-[#C9A84C] ring-2 ring-[#C9A84C]/20' : 'border-gray-200 hover:border-gray-300',
        )}
      >
        {selected ? (
          <>
            <span className="text-xl leading-none flex-shrink-0">{selected.flag}</span>
            <span className="flex-1 font-medium text-sm text-[#0B1F3A]">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-gray-400 text-sm">{placeholder}</span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search countries…"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm">No countries found</div>
            ) : filtered.map(c => (
              <button key={c.iso2} type="button"
                onClick={() => { onChange(c.iso2); setOpen(false); setQuery('') }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-[#F4F6F9] transition-colors',
                  c.iso2 === value && 'bg-[#C9A84C]/10',
                )}>
                <span className="text-xl leading-none flex-shrink-0">{c.flag}</span>
                <span className={cn('flex-1 font-medium', c.iso2 === value ? 'text-[#C9A84C]' : 'text-[#0B1F3A]')}>{c.name}</span>
                <span className="text-xs text-gray-300 font-mono">{c.iso2}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
