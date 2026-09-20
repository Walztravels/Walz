'use client'

/**
 * Walz Team Hub V1 — create a DM, GROUP, or CHANNEL (PUBLIC or PRIVATE,
 * with initial-member selection for PRIVATE). Any active staff member may
 * create any of these (see app/api/admin/team/conversations/route.ts's own
 * header comment — creation itself is open; only membership-management
 * afterward is permission-gated).
 */
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Overlay } from './Overlay'
import { teamFetch, extractErrorMessage } from '../lib/teamFetch'
import type { StaffDirectoryEntry } from '../types'

export interface CreateConversationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
}

type Tab = 'dm' | 'group' | 'channel'

function useStaffSearch(active: boolean) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StaffDirectoryEntry[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!active) return
    setSearching(true)
    const t = setTimeout(() => {
      teamFetch(`/api/admin/team/directory?q=${encodeURIComponent(query)}`)
        .then(res => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: StaffDirectoryEntry[] }) => setResults(Array.isArray(data.results) ? data.results : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [active, query])

  return { query, setQuery, results, searching }
}

export function CreateConversationModal({ open, onClose, onCreated }: CreateConversationModalProps) {
  const [tab, setTab] = useState<Tab>('dm')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dmTarget, setDmTarget] = useState<StaffDirectoryEntry | null>(null)
  const dmSearch = useStaffSearch(open && tab === 'dm' && !dmTarget)

  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<StaffDirectoryEntry[]>([])
  const groupSearch = useStaffSearch(open && tab === 'group')

  const [channelName, setChannelName] = useState('')
  const [channelDescription, setChannelDescription] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [joinable, setJoinable] = useState(true)
  const [channelMembers, setChannelMembers] = useState<StaffDirectoryEntry[]>([])
  const channelSearch = useStaffSearch(open && tab === 'channel' && visibility === 'PRIVATE')

  useEffect(() => {
    if (!open) return
    setTab('dm')
    setError(null)
    setDmTarget(null)
    setGroupName('')
    setGroupMembers([])
    setChannelName('')
    setChannelDescription('')
    setVisibility('PUBLIC')
    setJoinable(true)
    setChannelMembers([])
  }, [open])

  function toggleMember(list: StaffDirectoryEntry[], setList: (v: StaffDirectoryEntry[]) => void, s: StaffDirectoryEntry) {
    setList(list.some(m => m.id === s.id) ? list.filter(m => m.id !== s.id) : [...list, s])
  }

  async function submit() {
    setError(null)
    setCreating(true)
    try {
      let body: Record<string, unknown>
      if (tab === 'dm') {
        if (!dmTarget) { setError('Choose a colleague.'); return }
        body = { type: 'DM', staffId: dmTarget.id }
      } else if (tab === 'group') {
        if (!groupName.trim()) { setError('Give the group a name.'); return }
        if (groupMembers.length === 0) { setError('Add at least one other staff member.'); return }
        body = { type: 'GROUP', name: groupName.trim(), memberStaffIds: groupMembers.map(m => m.id) }
      } else {
        if (!channelName.trim()) { setError('Give the channel a name.'); return }
        body = {
          type: 'CHANNEL',
          name: channelName.trim(),
          description: channelDescription.trim() || undefined,
          visibility,
          joinable: visibility === 'PUBLIC' ? joinable : undefined,
          initialMemberStaffIds: visibility === 'PRIVATE' ? channelMembers.map(m => m.id) : undefined,
        }
      }
      const res = await teamFetch('/api/admin/team/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { setError(await extractErrorMessage(res, 'Could not create the conversation.')); return }
      const data = (await res.json()) as { conversationId: string }
      onCreated(data.conversationId)
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <Overlay open={open} onClose={onClose} title="New Conversation" variant="center" widthClassName="max-w-md">
      <div className="p-4 space-y-3">
        <div role="tablist" aria-label="Conversation type" className="flex gap-1.5">
          {(['dm', 'group', 'channel'] as Tab[]).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-walz-off-white text-walz-muted-strong hover:text-walz-navy'
              }`}
            >
              {t === 'dm' ? 'Direct Message' : t === 'group' ? 'Group' : 'Channel'}
            </button>
          ))}
        </div>

        {tab === 'dm' && (
          <div className="space-y-2">
            {dmTarget ? (
              <div className="flex items-center justify-between rounded-lg border border-walz-border px-3 py-2">
                <span className="text-sm font-semibold text-walz-navy">{dmTarget.name}</span>
                <button onClick={() => setDmTarget(null)} aria-label="Change" className="text-walz-muted-strong hover:text-walz-navy"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={dmSearch.query}
                  onChange={e => dmSearch.setQuery(e.target.value)}
                  placeholder="Search colleagues…"
                  className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
                {dmSearch.searching && <p className="text-xs text-walz-muted-strong flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {dmSearch.results.map(s => (
                    <button key={s.id} onClick={() => setDmTarget(s)} className="w-full text-left rounded-lg border border-walz-border px-3 py-2 hover:bg-walz-off-white">
                      <p className="text-sm font-semibold text-walz-navy">{s.name}</p>
                      <p className="text-[11px] text-walz-muted-strong">{[s.role, s.department].filter(Boolean).join(' · ')}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'group' && (
          <div className="space-y-2">
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            {groupMembers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {groupMembers.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-walz-navy/5 px-2 py-0.5 text-[11px] text-walz-navy">
                    {m.name}
                    <button onClick={() => toggleMember(groupMembers, setGroupMembers, m)} aria-label={`Remove ${m.name}`} className="min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 lg:-m-1.5 lg:p-1.5 inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-full"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={groupSearch.query}
              onChange={e => groupSearch.setQuery(e.target.value)}
              placeholder="Add colleagues…"
              className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {groupSearch.results.filter(s => !groupMembers.some(m => m.id === s.id)).map(s => (
                <button key={s.id} onClick={() => toggleMember(groupMembers, setGroupMembers, s)} className="w-full text-left rounded-lg border border-walz-border px-3 py-2 hover:bg-walz-off-white">
                  <p className="text-sm font-semibold text-walz-navy">{s.name}</p>
                  <p className="text-[11px] text-walz-muted-strong">{[s.role, s.department].filter(Boolean).join(' · ')}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'channel' && (
          <div className="space-y-2">
            <input
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              placeholder="Channel name"
              className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <textarea
              value={channelDescription}
              onChange={e => setChannelDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none"
            />
            <div className="flex gap-1.5">
              {(['PUBLIC', 'PRIVATE'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    visibility === v ? 'bg-blue-600 text-white' : 'bg-walz-off-white text-walz-muted-strong hover:text-walz-navy'
                  }`}
                >
                  {v === 'PUBLIC' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
            {visibility === 'PUBLIC' ? (
              <label className="flex items-center gap-2 text-xs text-walz-muted-strong">
                <input type="checkbox" checked={joinable} onChange={e => setJoinable(e.target.checked)} />
                Anyone can join without an invite
              </label>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-walz-muted-strong">Add initial members (private channels require an invite to join later)</p>
                {channelMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {channelMembers.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-walz-navy/5 px-2 py-0.5 text-[11px] text-walz-navy">
                        {m.name}
                        <button onClick={() => toggleMember(channelMembers, setChannelMembers, m)} aria-label={`Remove ${m.name}`} className="min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 lg:-m-1.5 lg:p-1.5 inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-full"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  value={channelSearch.query}
                  onChange={e => channelSearch.setQuery(e.target.value)}
                  placeholder="Add colleagues…"
                  className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {channelSearch.results.filter(s => !channelMembers.some(m => m.id === s.id)).map(s => (
                    <button key={s.id} onClick={() => toggleMember(channelMembers, setChannelMembers, s)} className="w-full text-left rounded-lg border border-walz-border px-3 py-2 hover:bg-walz-off-white">
                      <p className="text-sm font-semibold text-walz-navy">{s.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-walz-error">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={creating}
          className="w-full rounded-lg bg-blue-600 text-white text-sm font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
        </button>
      </div>
    </Overlay>
  )
}
