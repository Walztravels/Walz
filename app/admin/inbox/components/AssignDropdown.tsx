'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CWAgent, initials } from '../types'

interface Props {
  agents:   CWAgent[]
  current:  CWAgent | null | undefined
  onAssign: (agentId: number) => Promise<void>
  disabled?: boolean
}

export function AssignDropdown({ agents, current, onAssign, disabled }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)

  async function handle(id: number) {
    setLoading(true)
    setOpen(false)
    try { await onAssign(id) } finally { setLoading(false) }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled || loading}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-walz-navy/5 hover:bg-walz-navy/10 border border-walz-border text-xs text-walz-navy transition-colors disabled:opacity-50"
      >
        {current ? (
          <>
            <span className="w-5 h-5 rounded-full bg-walz-navy text-walz-gold text-[9px] font-bold flex items-center justify-center">
              {initials(current.name)}
            </span>
            {current.name}
          </>
        ) : (
          <span className="text-walz-muted-strong">Assign agent</span>
        )}
        <ChevronDown className="w-3 h-3 text-walz-muted-strong" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-white border border-walz-border shadow-xl z-20 overflow-hidden py-1">
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => handle(a.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-walz-navy hover:bg-walz-off-white transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.availability_status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="w-6 h-6 rounded-full bg-walz-navy text-walz-gold text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {initials(a.name)}
                </span>
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
