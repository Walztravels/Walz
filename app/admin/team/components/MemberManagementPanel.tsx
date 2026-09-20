'use client'

/**
 * Walz Team Hub V1 — view + (if authorized) manage this conversation's
 * membership. Add/remove controls are HIDDEN entirely for a staff member
 * without management rights (rather than shown disabled) — the heuristic
 * used here is `myMembership.role === 'admin'` (the channel/group creator,
 * or anyone since promoted), which covers the common case; a Team Hub-wide
 * `team_hub_channel_manage` grantee who isn't 'admin' on THIS conversation
 * would still see the read-only view, and the server remains the real
 * authority regardless (POST/DELETE still re-check
 * checkCanManageMembership server-side either way).
 */
import { useEffect, useState } from 'react'
import { Loader2, UserMinus, UserPlus } from 'lucide-react'
import { Overlay } from './Overlay'
import { teamFetch, extractErrorMessage } from '../lib/teamFetch'
import type { StaffDirectoryEntry, TeamConversationDetail } from '../types'

export interface MemberManagementPanelProps {
  open: boolean
  onClose: () => void
  conversation: TeamConversationDetail
  onChanged: () => void
}

export function MemberManagementPanel({ open, onClose, conversation, onChanged }: MemberManagementPanelProps) {
  const canManage = conversation.myMembership.role === 'admin'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StaffDirectoryEntry[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !canManage) return
    setSearching(true)
    const t = setTimeout(() => {
      teamFetch(`/api/admin/team/directory?q=${encodeURIComponent(query)}`)
        .then(res => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: StaffDirectoryEntry[] }) => setResults(Array.isArray(data.results) ? data.results : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [open, canManage, query])

  async function addMember(staffId: string) {
    setBusyId(staffId)
    setError(null)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversation.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      })
      if (!res.ok) { setError(await extractErrorMessage(res, 'Could not add that member.')); return }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function removeMember(staffId: string) {
    setBusyId(staffId)
    setError(null)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversation.id}/members/${staffId}`, { method: 'DELETE' })
      if (!res.ok) { setError(await extractErrorMessage(res, 'Could not remove that member.')); return }
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  const existingIds = new Set(conversation.members.map(m => m.staffId))

  return (
    <Overlay open={open} onClose={onClose} title={conversation.type === 'DM' ? 'Participants' : 'Members'}>
      <div className="p-4 space-y-3">
        <ul className="space-y-1.5">
          {conversation.members.map(m => (
            <li key={m.staffId} className="flex items-center justify-between gap-2 rounded-lg border border-walz-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-walz-deep-navy truncate">
                  {m.name} {m.role === 'admin' && <span className="text-[10px] font-bold text-walz-gold uppercase ml-1">Admin</span>}
                </p>
                <p className="text-[11px] text-walz-muted-strong truncate">{[m.roleTitle, m.department].filter(Boolean).join(' · ')}</p>
              </div>
              {canManage && conversation.type !== 'DM' && (
                <button
                  onClick={() => void removeMember(m.staffId)}
                  disabled={busyId === m.staffId}
                  aria-label={`Remove ${m.name}`}
                  className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-error hover:bg-red-50 disabled:opacity-40"
                >
                  {busyId === m.staffId ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="text-xs text-walz-error">{error}</p>}

        {canManage && conversation.type !== 'DM' ? (
          <div className="space-y-2 pt-2 border-t border-walz-border">
            <p className="text-xs font-semibold text-walz-deep-navy flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Add a member</p>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search staff…"
              className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            {searching && <p className="text-xs text-walz-muted-strong flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
            <div className="max-h-40 overflow-y-auto space-y-1">
              {results.filter(s => !existingIds.has(s.id)).map(s => (
                <button
                  key={s.id}
                  onClick={() => void addMember(s.id)}
                  disabled={busyId === s.id}
                  className="w-full text-left rounded-lg border border-walz-border px-3 py-2 hover:bg-walz-off-white disabled:opacity-50 flex items-center justify-between"
                >
                  <span>
                    <span className="block text-sm font-semibold text-walz-navy">{s.name}</span>
                    <span className="block text-[11px] text-walz-muted-strong">{[s.role, s.department].filter(Boolean).join(' · ')}</span>
                  </span>
                  {busyId === s.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                </button>
              ))}
            </div>
          </div>
        ) : conversation.type !== 'DM' ? (
          <p className="text-xs text-walz-muted-strong pt-2 border-t border-walz-border">You don't have permission to manage members of this conversation.</p>
        ) : null}
      </div>
    </Overlay>
  )
}
