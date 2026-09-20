'use client'

// AskTeamPanel — Team Hub "Ask Team" surface, opened from ReplyBox's Ask
// Team button via ComposerDraftContext's openAskTeam/registerAskTeamOpener
// pair (mirrors the openJadeMenu/registerJadeMenuOpener V1.4 pattern
// exactly). Mirrors the modal/drawer chrome already established by
// DetailsDrawer.tsx (right-side slide-in, scrim, Esc-to-close) for visual
// consistency with the rest of the Inbox's overlay surfaces.
//
// Offers three ways for a staff member to loop in a colleague about the
// currently-selected Inbox conversation:
//   - Message a colleague (DM)
//   - Ask a channel
//   - Start an internal discussion (GROUP)
//
// Whichever is chosen, the resulting Team Hub message is prefixed with a
// minimal, server-built client-context card (GET .../team-context — NEVER
// full transcript/PII/documents/risk/margin, only display name + a coarse
// "Area" label, and only when identity resolution is LINKED or VERIFIED)
// plus whatever the staff member typed. The specific TeamMessage created is
// then linked to this Inbox conversation via POST .../inbox-link, so
// action-status.ts's "Team clarification" chip and Team Hub's own "Open
// Client Conversation" button both have a real messageId↔conversationId
// pair to work from.
//
// "Call [Staff]" is an inert, clearly-labeled stub — real Twilio calling is
// being wired up by a different agent in parallel; CALL_STAFF_STUB below is
// the intended hook point (swap for a real handler once calling lands).

import { useEffect, useState } from 'react'
import { X, ArrowLeft, Users, Hash, MessagesSquare, Loader2, Check, Phone, ExternalLink } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface AskTeamPanelProps {
  open: boolean
  onClose: () => void
  /** The currently-selected Inbox (Chatwoot) conversation id, or null when nothing is selected. */
  conversationId: number | null
}

type View = 'menu' | 'colleague' | 'channel' | 'discussion' | 'compose' | 'sending' | 'done'

interface StaffResult {
  id: string
  name: string
  role: string | null
  department: string | null
  status: string
}

interface ChannelOption {
  id: string
  name: string | null
  joined: boolean
}

interface ContextCard {
  available: boolean
  clientDisplayName?: string | null
  area?: string | null
}

type Target =
  | { kind: 'dm'; staffId: string; staffName: string }
  | { kind: 'channel'; conversationId: string; name: string; needsJoin: boolean }
  | { kind: 'group'; name: string; memberStaffIds: string[]; memberNames: string[] }

/**
 * TODO(calling): wire this up to the real Twilio call flow once it lands.
 * Named/exported so the other agent's work can replace it without touching
 * this panel's layout — see the "Call [Staff]" button below.
 */
function CallStaffStub({ staffName }: { staffName: string }) {
  return (
    <button
      type="button"
      disabled
      title="Calling is coming soon"
      aria-label={`Call ${staffName} (coming soon)`}
      className="flex items-center gap-1 rounded-lg border border-walz-border px-2 py-1 text-[11px] font-semibold text-walz-muted-strong opacity-60 cursor-not-allowed"
    >
      <Phone className="w-3 h-3" /> Call
    </button>
  )
}

export function AskTeamPanel({ open, onClose, conversationId }: AskTeamPanelProps) {
  const [view, setView] = useState<View>('menu')
  const [contextCard, setContextCard] = useState<ContextCard | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StaffResult[]>([])
  const [searching, setSearching] = useState(false)

  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [loadingChannels, setLoadingChannels] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<StaffResult[]>([])

  const [target, setTarget] = useState<Target | null>(null)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [doneInfo, setDoneInfo] = useState<{ teamConversationId: string; messageId: string; linked: boolean } | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)

  // Reset everything on open (or when the selected conversation changes
  // while open) — never carry stale target/question/context across
  // conversations, mirroring the reset discipline JadeAssistPanel already
  // applies for the same reason.
  useEffect(() => {
    if (!open) return
    setView('menu')
    setQuery('')
    setResults([])
    setChannels([])
    setGroupName('')
    setGroupMembers([])
    setTarget(null)
    setQuestion('')
    setError(null)
    setDoneInfo(null)
    setResolving(false)
    setResolved(false)
    setContextCard(null)
    if (conversationId != null) {
      fetch(`/api/admin/inbox/conversations/${conversationId}/team-context`)
        .then(res => (res.ok ? res.json() : { available: false }))
        .then(data => setContextCard(data))
        .catch(() => setContextCard({ available: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Staff directory search — used by both "Message a colleague" (single
  // pick) and "Start an internal discussion" (multi-pick).
  useEffect(() => {
    if (view !== 'colleague' && view !== 'discussion') return
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/admin/team/directory?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => setResults(Array.isArray(data.results) ? data.results : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, view])

  // Channel list — joined channels plus discoverable-but-not-yet-joined
  // PUBLIC channels (GET /api/admin/team/conversations's own shape).
  useEffect(() => {
    if (view !== 'channel') return
    setLoadingChannels(true)
    fetch('/api/admin/team/conversations')
      .then(res => res.json())
      .then((data: { joined?: Array<{ id: string; type: string; name: string | null }>; discoverablePublic?: Array<{ id: string; name: string | null }> }) => {
        const joined = (data.joined ?? []).filter(c => c.type === 'CHANNEL').map(c => ({ id: c.id, name: c.name, joined: true }))
        const discoverable = (data.discoverablePublic ?? []).map(c => ({ id: c.id, name: c.name, joined: false }))
        setChannels([...joined, ...discoverable])
      })
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false))
  }, [view])

  if (!open) return null

  function contextCardText(): string {
    if (!contextCard?.available) return ''
    const parts: string[] = []
    if (contextCard.clientDisplayName) parts.push(`Client: ${contextCard.clientDisplayName}`)
    if (contextCard.area) parts.push(`Area: ${contextCard.area}`)
    if (conversationId != null) parts.push(`Inbox conversation #${conversationId}`)
    return parts.length ? `📋 ${parts.join(' · ')}\n\n` : ''
  }

  function toggleGroupMember(s: StaffResult) {
    setGroupMembers(prev => (prev.some(m => m.id === s.id) ? prev.filter(m => m.id !== s.id) : [...prev, s]))
  }

  async function submit() {
    if (!target || !question.trim() || conversationId == null) return
    setView('sending')
    setError(null)
    try {
      let teamConversationId: string
      if (target.kind === 'dm') {
        const res = await fetch('/api/admin/team/conversations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'DM', staffId: target.staffId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not start a conversation with that colleague.')
        teamConversationId = data.conversationId
      } else if (target.kind === 'channel') {
        if (target.needsJoin) {
          await fetch(`/api/admin/team/conversations/${target.conversationId}/join`, { method: 'POST' })
        }
        teamConversationId = target.conversationId
      } else {
        const res = await fetch('/api/admin/team/conversations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'GROUP', name: target.name, memberStaffIds: target.memberStaffIds }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not create the discussion group.')
        teamConversationId = data.conversationId
      }

      const messageBody = `${contextCardText()}${question.trim()}`
      const msgRes = await fetch(`/api/admin/team/conversations/${teamConversationId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: messageBody }),
      })
      const msgData = await msgRes.json()
      if (!msgRes.ok) throw new Error(msgData.error ?? 'Could not send the message.')

      // Best-effort link — a failure here never undoes or blocks the
      // message that already sent; staff can still find the conversation
      // manually in Team Hub, they just won't get the automatic chip/link.
      let linked = false
      try {
        const linkRes = await fetch(`/api/admin/team/conversations/${teamConversationId}/inbox-link`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msgData.message.id, inboxConversationId: conversationId }),
        })
        linked = linkRes.ok
      } catch { /* non-fatal */ }

      setDoneInfo({ teamConversationId, messageId: msgData.message.id, linked })
      setView('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setView('compose')
    }
  }

  async function markResolved() {
    if (!doneInfo) return
    setResolving(true)
    try {
      const res = await fetch(`/api/admin/team/conversations/${doneInfo.teamConversationId}/inbox-link`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: doneInfo.messageId, status: 'RESOLVED' }),
      })
      if (res.ok) setResolved(true)
    } finally {
      setResolving(false)
    }
  }

  const busy = view === 'sending'

  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask Team"
        className="absolute inset-y-0 right-0 w-full sm:max-w-sm bg-white shadow-2xl flex flex-col"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <div className="flex items-center gap-2">
            {view !== 'menu' && view !== 'done' && (
              <button onClick={() => setView('menu')} aria-label="Back" className="text-walz-muted-strong hover:text-walz-navy">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <p className="text-sm font-bold text-walz-deep-navy">Ask Team</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="min-w-[32px] min-h-[32px] flex items-center justify-center text-walz-muted-strong hover:text-walz-navy">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {conversationId == null && (
            <p className="text-xs text-walz-muted-strong">Select a conversation first.</p>
          )}

          {contextCard?.available && (
            <div className="rounded-lg border border-walz-border bg-walz-off-white/60 p-3 text-xs">
              <p className="font-semibold text-walz-deep-navy">{contextCard.clientDisplayName ?? 'Client'}</p>
              {contextCard.area && <p className="text-walz-muted-strong">{contextCard.area}</p>}
            </div>
          )}

          {view === 'menu' && conversationId != null && (
            <div className="space-y-2">
              <button
                onClick={() => setView('colleague')}
                className="w-full flex items-center gap-2 rounded-lg border border-walz-border px-3 py-2.5 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5"
              >
                <MessagesSquare className="w-4 h-4 text-emerald-600" /> Message a colleague
              </button>
              <button
                onClick={() => setView('channel')}
                className="w-full flex items-center gap-2 rounded-lg border border-walz-border px-3 py-2.5 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5"
              >
                <Hash className="w-4 h-4 text-blue-600" /> Ask a channel
              </button>
              <button
                onClick={() => setView('discussion')}
                className="w-full flex items-center gap-2 rounded-lg border border-walz-border px-3 py-2.5 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5"
              >
                <Users className="w-4 h-4 text-walz-gold" /> Start an internal discussion
              </button>
            </div>
          )}

          {view === 'colleague' && (
            <div className="space-y-2">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search staff by name, role, department…"
                className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none"
              />
              {searching && <p className="text-xs text-walz-muted-strong flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
              <div className="space-y-1">
                {results.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-walz-border px-3 py-2">
                    <button
                      onClick={() => { setTarget({ kind: 'dm', staffId: s.id, staffName: s.name }); setView('compose') }}
                      className="text-left flex-1"
                    >
                      <p className="text-sm font-semibold text-walz-navy">{s.name}</p>
                      <p className="text-[11px] text-walz-muted-strong">{[s.role, s.department].filter(Boolean).join(' · ')}</p>
                    </button>
                    <CallStaffStub staffName={s.name} />
                  </div>
                ))}
                {!searching && results.length === 0 && <p className="text-xs text-walz-muted-strong">No staff found.</p>}
              </div>
            </div>
          )}

          {view === 'channel' && (
            <div className="space-y-2">
              {loadingChannels && <p className="text-xs text-walz-muted-strong flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading channels…</p>}
              {channels.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setTarget({ kind: 'channel', conversationId: c.id, name: c.name ?? 'Channel', needsJoin: !c.joined }); setView('compose') }}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-walz-border px-3 py-2 text-left hover:bg-walz-navy/5"
                >
                  <span className="text-sm font-semibold text-walz-navy"># {c.name}</span>
                  {!c.joined && <span className="text-[10px] text-walz-muted-strong">Join & post</span>}
                </button>
              ))}
              {!loadingChannels && channels.length === 0 && <p className="text-xs text-walz-muted-strong">No channels available.</p>}
            </div>
          )}

          {view === 'discussion' && (
            <div className="space-y-2">
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Discussion name (e.g. Visa question — Chidi)"
                className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none"
              />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Add colleagues…"
                className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none"
              />
              {groupMembers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {groupMembers.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-walz-navy/5 px-2 py-0.5 text-[11px] text-walz-navy">
                      {m.name}
                      <button onClick={() => toggleGroupMember(m)} aria-label={`Remove ${m.name}`}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {results.filter(s => !groupMembers.some(m => m.id === s.id)).map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleGroupMember(s)}
                    className="w-full text-left rounded-lg border border-walz-border px-3 py-2 hover:bg-walz-navy/5"
                  >
                    <p className="text-sm font-semibold text-walz-navy">{s.name}</p>
                    <p className="text-[11px] text-walz-muted-strong">{[s.role, s.department].filter(Boolean).join(' · ')}</p>
                  </button>
                ))}
              </div>
              <button
                disabled={!groupName.trim() || groupMembers.length === 0}
                onClick={() => {
                  setTarget({ kind: 'group', name: groupName.trim(), memberStaffIds: groupMembers.map(m => m.id), memberNames: groupMembers.map(m => m.name) })
                  setView('compose')
                }}
                className="w-full rounded-lg bg-blue-600 text-white text-sm font-semibold py-2 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {(view === 'compose' || view === 'sending') && target && (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">
                {target.kind === 'dm' && `To ${target.staffName}`}
                {target.kind === 'channel' && `To #${target.name}`}
                {target.kind === 'group' && `New discussion "${target.name}" with ${target.memberNames.join(', ')}`}
              </p>
              <textarea
                autoFocus
                value={question}
                onChange={e => setQuestion(e.target.value)}
                rows={4}
                placeholder="What do you need help with?"
                disabled={busy}
                className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none resize-none"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                disabled={!question.trim() || busy}
                onClick={submit}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold py-2 disabled:opacity-40"
              >
                {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : 'Send'}
              </button>
            </div>
          )}

          {view === 'done' && doneInfo && (
            <div className="space-y-3">
              <p className="text-sm text-walz-navy flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" /> Sent to your team.</p>
              {!doneInfo.linked && (
                <p className="text-xs text-amber-700">Sent, but this could not be linked back to the client conversation automatically.</p>
              )}
              <a
                href={`/admin/team?c=${doneInfo.teamConversationId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-walz-border px-3 py-2 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5"
              >
                Open in Team Hub <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <div>
                <button
                  onClick={markResolved}
                  disabled={resolving || resolved}
                  className="text-xs font-semibold text-walz-muted-strong hover:text-walz-navy disabled:opacity-50"
                >
                  {resolved ? 'Marked resolved' : resolving ? 'Marking resolved…' : 'Mark resolved'}
                </button>
              </div>
              <button onClick={onClose} className="w-full rounded-lg border border-walz-border py-2 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
