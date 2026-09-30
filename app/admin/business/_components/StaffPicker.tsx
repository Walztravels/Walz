'use client'

// Account-manager picker: search ACTIVE staff by name/email and select one.
// Replaces a free-text Staff id/email field. The server stays authoritative
// — the chosen email is re-verified against an active Staff row by
// app/api/admin/business/organizations/[id]/account-manager/route.ts.

import { useEffect, useState } from 'react'
import { inputCls } from './ui'

export interface StaffOption { name: string; email: string; roleTitle: string | null }

export default function StaffPicker({ value, onChange }: { value: StaffOption | null; onChange: (s: StaffOption | null) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<StaffOption[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/business/staff-search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        const data = await res.json().catch(() => ({}))
        setResults(res.ok ? data.staff ?? [] : [])
        setOpen(true)
      } catch { /* aborted */ }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex-[1_1_240px]">
        <span className="text-white text-sm">{value.name}</span>
        <span className="text-white/50 text-xs">{value.email}</span>
        <button type="button" onClick={() => onChange(null)} className="ml-auto text-white/50 text-xs hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex-[1_1_240px]">
      <input
        aria-label="Search staff by name or email"
        placeholder="Search staff by name or email…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        className={`${inputCls} w-full text-sm`}
      />
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 w-full bg-[#0f1c33] border border-white/10 rounded-xl overflow-hidden shadow-xl">
          {results.map(s => (
            <li key={s.email}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => { onChange(s); setOpen(false); setQ('') }}
                className="w-full text-left px-3 py-2 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
              >
                <span className="block text-white text-sm">{s.name}</span>
                <span className="block text-white/50 text-xs">{s.email}{s.roleTitle ? ` · ${s.roleTitle}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length >= 2 && results.length === 0 && (
        <p className="absolute mt-1 text-white/40 text-xs">No active staff match.</p>
      )}
    </div>
  )
}
