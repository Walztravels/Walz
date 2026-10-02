'use client'

// components/business/AccountMenu.tsx — Walz Business (V1-A)
// Profile/account menu + logout. Calls the EXISTING NextAuth signOut() —
// no change to lib/auth.ts or the session model.

import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react'

export interface AccountMenuUser {
  name?: string | null
  email?: string | null
}

function initials(user: AccountMenuUser): string {
  const source = user.name?.trim() || user.email?.trim() || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function AccountMenu({ user }: { user: AccountMenuUser }) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  async function handleSignOut() {
    setSigningOut(true)
    await signOut({ callbackUrl: '/business/login' })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#0B1F3A] text-white text-[11px] font-semibold flex-shrink-0">
          {initials(user)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-[#0B1F3A] truncate flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              {user.name ?? 'Your account'}
            </p>
            {user.email && <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <LogOut className="w-4 h-4 text-slate-400" aria-hidden="true" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
