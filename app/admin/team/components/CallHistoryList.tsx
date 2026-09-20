'use client'

/**
 * Walz Team Hub V1 — a conversation's call history (GET .../calls). Simple
 * list per the product spec ("a simple list is fine") — operational
 * metadata only, no recording/audio reference exists anywhere in this data
 * model.
 */
import { useEffect, useState } from 'react'
import { Loader2, Phone, PhoneMissed, PhoneOff } from 'lucide-react'
import { Overlay } from './Overlay'
import { teamFetch } from '../lib/teamFetch'
import type { TeamCallHistoryEntry, TeamConversationMemberSummary } from '../types'

export interface CallHistoryListProps {
  open: boolean
  onClose: () => void
  conversationId: string
  members: TeamConversationMemberSummary[]
}

function nameFor(staffId: string, members: TeamConversationMemberSummary[]): string {
  return members.find(m => m.staffId === staffId)?.name ?? 'Unknown'
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function statusIcon(status: string) {
  if (status === 'ANSWERED' || status === 'ENDED') return Phone
  if (status === 'MISSED') return PhoneMissed
  return PhoneOff
}

export function CallHistoryList({ open, onClose, conversationId, members }: CallHistoryListProps) {
  const [calls, setCalls] = useState<TeamCallHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(false)
    teamFetch(`/api/admin/team/conversations/${conversationId}/calls`)
      .then(async res => {
        if (!res.ok) { if (!cancelled) setError(true); return }
        const data = (await res.json()) as { calls: TeamCallHistoryEntry[] }
        if (!cancelled) setCalls(Array.isArray(data.calls) ? data.calls : [])
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, conversationId])

  return (
    <Overlay open={open} onClose={onClose} title="Call History">
      <div className="p-4">
        {loading ? (
          <p className="text-xs text-walz-muted-strong flex items-center gap-1.5 justify-center py-6"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
        ) : error ? (
          <p className="text-xs text-walz-error text-center py-6">Could not load call history.</p>
        ) : calls.length === 0 ? (
          <p className="text-xs text-walz-muted-strong text-center py-6">No calls yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {calls.map(call => {
              const Icon = statusIcon(call.status)
              return (
                <li key={call.id} className="flex items-center gap-3 rounded-lg border border-walz-border px-3 py-2">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${call.status === 'MISSED' || call.status === 'DECLINED' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-walz-deep-navy truncate">
                      {nameFor(call.callerId, members)} → {call.calleeIds.map(id => nameFor(id, members)).join(', ')}
                    </p>
                    <p className="text-[11px] text-walz-muted-strong">
                      {new Date(call.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {call.status.toLowerCase()} · {formatDuration(call.durationSeconds)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Overlay>
  )
}
