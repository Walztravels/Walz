'use client'

// Dashboard entry point for the Secure Application Lookup.
// A prominent search-style button that opens the same drawer used in the
// Admin Inbox — same engine, same verification gate, same audit trail.

import { useState } from 'react'
import { FileSearch } from 'lucide-react'
import { ApplicationLookupDrawer } from '@/components/admin/ApplicationLookupDrawer'

export function ApplicationLookupLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#112240] ring-1 ring-[#C9A84C]/25 text-left transition-all hover:bg-[#152a4e] hover:ring-[#C9A84C]/50 active:scale-[0.99]"
      >
        <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
          <FileSearch className="w-4.5 h-4.5 text-[#C9A84C]" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Search Application Record</p>
          <p className="text-xs text-white/40">Look up by Walz Reference — client identity verification required</p>
        </div>
        <span className="ml-auto text-white/25 text-xs font-mono hidden sm:block">WALZ-XXXXXX</span>
      </button>
      {open && <ApplicationLookupDrawer onClose={() => setOpen(false)} />}
    </>
  )
}
