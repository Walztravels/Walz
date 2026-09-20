'use client'

/**
 * Walz Team Hub V1 — staff directory: search by name/role/department (GET
 * .../team/directory?q=, no raw DB ids ever shown), "Message" opens/creates
 * a DM, and a "Call" affordance that creates/opens the DM then places a
 * call through the shared TeamCallDeviceProvider — matching the product
 * spec's "for a DM, a call button once the conversation exists".
 */
import { useEffect, useState } from 'react'
import { Loader2, MessageSquare, Phone, Search } from 'lucide-react'
import { Overlay } from './Overlay'
import { teamFetch, extractErrorMessage } from '../lib/teamFetch'
import { useTeamCallDeviceContext } from '../calls/useTeamCallDevice'
import type { StaffDirectoryEntry } from '../types'

export interface StaffDirectoryPanelProps {
  open: boolean
  onClose: () => void
  onOpenConversation: (conversationId: string) => void
}

export function StaffDirectoryPanel({ open, onClose, onOpenConversation }: StaffDirectoryPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StaffDirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const { placeCall, status: callStatus } = useTeamCallDeviceContext()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      teamFetch(`/api/admin/team/directory?q=${encodeURIComponent(query)}`)
        .then(async res => {
          if (!res.ok) { setError(await extractErrorMessage(res, 'Could not load the staff directory.')); return }
          const data = (await res.json()) as { results: StaffDirectoryEntry[] }
          setResults(Array.isArray(data.results) ? data.results : [])
        })
        .catch(() => setError('Could not load the staff directory.'))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [open, query, retryTick])

  async function startDm(staffId: string): Promise<string | null> {
    const res = await teamFetch('/api/admin/team/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'DM', staffId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { conversationId: string }
    return data.conversationId
  }

  async function handleMessage(staffId: string) {
    setBusyId(staffId)
    try {
      const conversationId = await startDm(staffId)
      if (conversationId) { onOpenConversation(conversationId); onClose() }
    } finally {
      setBusyId(null)
    }
  }

  async function handleCall(staff: StaffDirectoryEntry) {
    setBusyId(staff.id)
    try {
      const conversationId = await startDm(staff.id)
      if (conversationId) void placeCall(conversationId, staff.id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Overlay open={open} onClose={onClose} title="Staff Directory">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 bg-walz-off-white rounded-lg px-2.5 py-2 border border-walz-border">
          <Search className="w-3.5 h-3.5 text-walz-muted-strong flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, role, department…"
            aria-label="Search staff directory"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500/50 rounded placeholder-walz-muted-strong"
          />
        </div>

        {error ? (
          <div className="text-center py-6 text-xs">
            <p className="text-walz-error">{error}</p>
            <button onClick={() => setRetryTick(t => t + 1)} className="mt-1 underline font-semibold text-walz-navy">Retry</button>
          </div>
        ) : loading ? (
          <p className="text-xs text-walz-muted-strong flex items-center gap-1.5 justify-center py-6"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-xs text-walz-muted-strong text-center py-6">No staff found.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-walz-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-walz-deep-navy truncate">{s.name}</p>
                  <p className="text-[11px] text-walz-muted-strong truncate">{[s.role, s.department].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => void handleCall(s)}
                    disabled={busyId === s.id || callStatus !== 'READY'}
                    aria-label={`Call ${s.name}`}
                    title={callStatus !== 'READY' ? 'Calling is not ready yet' : `Call ${s.name}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-600/10 disabled:opacity-40 transition-colors"
                  >
                    <Phone className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => void handleMessage(s.id)}
                    disabled={busyId === s.id}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 text-white text-xs font-semibold px-2.5 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    Message
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Overlay>
  )
}
