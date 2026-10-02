'use client'

// components/business/OrgSwitcher.tsx — Walz Business (V1-A)
//
// Only ever rendered when the caller belongs to 2+ ACTIVE organizations —
// the parent layout (app/business/(portal)/layout.tsx) queries
// OrganizationMembership with { status: 'ACTIVE' } (the same pattern already
// used by app/business/(portal)/page.tsx) and passes the result down; this
// component never queries the database itself.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, Check, Building2 } from 'lucide-react'

export interface OrgSwitcherOrg {
  id: string
  name: string
}

export function OrgSwitcher({
  organizations,
  currentOrgId,
}: {
  organizations: OrgSwitcherOrg[]
  currentOrgId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hooks must run on every render regardless of the guard below (rules of
  // hooks) — the early return happens after, in the JSX.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Guard duplicated at render time too — the layout should already only
  // pass this component when there are 2+, but a stray extra call site
  // should never show a pointless single-item switcher.
  if (organizations.length < 2) return null

  const current = organizations.find(o => o.id === currentOrgId) ?? null

  function select(orgId: string) {
    setOpen(false)
    router.push(`/business/${orgId}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch organization"
        className="flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-[#0B1F3A] hover:bg-slate-50 transition-colors max-w-[220px]"
      >
        <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{current?.name ?? 'Select organization'}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1.5 w-64 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50"
        >
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Your organizations
          </p>
          {organizations.map(org => (
            <button
              key={org.id}
              type="button"
              role="menuitem"
              onClick={() => select(org.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span className="truncate">{org.name}</span>
              {org.id === currentOrgId && <Check className="w-4 h-4 text-[#0B1F3A] flex-shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
