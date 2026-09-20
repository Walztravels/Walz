'use client'

/**
 * Walz Team Hub V1 — the message history pane.
 *
 * Rendering rule (architecture audit, do not deviate): 1:1 DMs render as
 * two-party bubbles (own messages right-aligned, other left-aligned, one
 * avatar per message — mirrors MessageBubble.tsx's own two-party
 * treatment). GROUP/CHANNEL conversations render as grouped-by-sender flat
 * rows (Slack/Teams density) via lib/messageGrouping.ts's pure grouping
 * function — MessageBubble.tsx's bubble treatment structurally assumes
 * exactly 2 participants and looks wrong with 3+.
 *
 * Infinite-scroll-up pagination (`before`) mirrors ChatWindow.tsx's own
 * scroll contract: open at the latest message; scrolling near the top loads
 * an older page while preserving visual position; a new message auto-
 * scrolls only when the reader is already near the bottom, otherwise a
 * "New messages" control appears.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Loader2, MessageSquareText, Pencil, Reply, Trash2, X, Check } from 'lucide-react'
import { ReactionPicker } from './ReactionPicker'
import { teamFetch } from '../lib/teamFetch'
import { groupMessagesBySender } from '../lib/messageGrouping'
import type { ConversationType, TeamMessage } from '../types'

const TOP_TRIGGER_PX = 80

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isNearBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) < 120
}

export interface MessageListProps {
  conversationId: string
  conversationType: ConversationType
  messages: TeamMessage[]
  currentStaffId?: string | null
  loading: boolean
  loadError: boolean
  onRetryLoad: () => void
  hasMore: boolean
  loadingOlder: boolean
  olderError: boolean
  onLoadOlder: () => void
  onReact: (messageId: string, emoji: string) => Promise<{ ok: boolean; error?: string }>
  onEdit: (messageId: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onDelete: (messageId: string) => Promise<{ ok: boolean; error?: string }>
  onOpenThread: (messageId: string) => void
  onMarkRead: (messageId: string) => void
  emptyHint?: string
}

async function openAttachment(conversationId: string, messageId: string, attachmentId: string) {
  try {
    const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`)
    if (!res.ok) return
    const data = (await res.json()) as { signedUrl: string }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  } catch { /* best-effort */ }
}

function ReactionRow({ reactions, currentStaffId, onReact }: { reactions: TeamMessage['reactions']; currentStaffId?: string | null; onReact: (emoji: string) => void }) {
  if (reactions.length === 0) return null
  const byEmoji = new Map<string, number>()
  const mine = new Set<string>()
  for (const r of reactions) {
    byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? 0) + 1)
    if (r.staffId === currentStaffId) mine.add(r.emoji)
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Array.from(byEmoji.entries()).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          aria-label={`${emoji} reaction, ${count}${mine.has(emoji) ? ', you reacted' : ''}`}
          className={`text-[11px] rounded-full px-1.5 py-0.5 border transition-colors ${
            mine.has(emoji) ? 'bg-walz-gold/15 border-walz-gold/40 text-walz-deep-navy' : 'bg-walz-off-white border-walz-border text-walz-muted-strong hover:bg-walz-navy/5'
          }`}
        >
          {emoji} {count}
        </button>
      ))}
    </div>
  )
}

function AttachmentList({ conversationId, message }: { conversationId: string; message: TeamMessage }) {
  if (message.attachments.length === 0) return null
  return (
    <div className="flex flex-col gap-1 mt-1">
      {message.attachments.map(att => (
        <button
          key={att.id}
          onClick={() => void openAttachment(conversationId, message.id, att.id)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-walz-off-white border border-walz-border text-walz-navy hover:bg-walz-navy/5 max-w-full text-left"
        >
          📎 <span className="truncate">{att.filename}</span>
          <span className="text-[10px] text-walz-muted-strong flex-shrink-0">{(att.sizeBytes / 1024).toFixed(0)} KB</span>
        </button>
      ))}
    </div>
  )
}

interface RowActionsProps {
  message: TeamMessage
  isMine: boolean
  onReply: () => void
  onReact: (emoji: string) => void
  onStartEdit: () => void
  onDelete: () => void
}

function RowActions({ message, isMine, onReply, onReact, onStartEdit, onDelete }: RowActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <ReactionPicker label="React to this message" onPick={onReact} />
      <button
        onClick={onReply}
        aria-label="Reply in thread"
        title="Reply in thread"
        className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
      {isMine && (
        <button
          onClick={onStartEdit}
          aria-label="Edit message"
          title="Edit"
          className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {isMine && (
        <button
          onClick={onDelete}
          aria-label="Delete message"
          title="Delete"
          className="min-w-[44px] min-h-[44px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:text-walz-error hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400/50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

export function MessageList({
  conversationId, conversationType, messages, currentStaffId, loading, loadError, onRetryLoad,
  hasMore, loadingOlder, olderError, onLoadOlder, onReact, onEdit, onDelete, onOpenThread, onMarkRead,
  emptyHint,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const prevRef = useRef<{ firstId: string | null; lastId: string | null; scrollHeight: number }>({ firstId: null, lastId: null, scrollHeight: 0 })
  const [showNewIndicator, setShowNewIndicator] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // QA finding (FAIL, fixed): a failed reaction previously just silently
  // un-toggled with no feedback. Small dismissible, self-clearing banner —
  // reactions are rare enough failures that a modal/toast would be
  // overkill, but silence was a real bug.
  const [reactionError, setReactionError] = useState<string | null>(null)
  useEffect(() => {
    if (!reactionError) return
    const id = setTimeout(() => setReactionError(null), 4000)
    return () => clearTimeout(id)
  }, [reactionError])

  async function handleReact(messageId: string, emoji: string) {
    const result = await onReact(messageId, emoji)
    if (!result.ok) setReactionError(result.error ?? 'Could not add that reaction.')
  }

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setShowNewIndicator(false)
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
    if (nearBottomRef.current) setShowNewIndicator(false)
    if (el.scrollTop <= TOP_TRIGGER_PX && !loadingOlder && hasMore && !olderError && messages.length > 0) {
      prevRef.current.scrollHeight = el.scrollHeight
      onLoadOlder()
    }
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const firstId = messages[0]?.id ?? null
    const lastId = messages[messages.length - 1]?.id ?? null
    const prev = prevRef.current

    if (prev.firstId === null && prev.lastId === null && messages.length > 0) {
      scrollToBottom('auto')
      nearBottomRef.current = true
      if (lastId) onMarkRead(lastId)
    } else if (prev.firstId !== null && firstId !== null && firstId !== prev.firstId && messages.some(m => m.id === prev.firstId)) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight
    } else if (lastId !== null && prev.lastId !== null && lastId !== prev.lastId) {
      if (nearBottomRef.current) { scrollToBottom('smooth'); if (lastId) onMarkRead(lastId) }
      else setShowNewIndicator(true)
    } else if (lastId && nearBottomRef.current) {
      onMarkRead(lastId)
    }

    prevRef.current = { firstId, lastId, scrollHeight: el.scrollHeight }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading messages">
        <Loader2 className="w-5 h-5 animate-spin text-walz-muted-strong" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm">
        <p className="text-walz-error">Could not load messages.</p>
        <button onClick={onRetryLoad} className="px-3 py-1.5 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold hover:bg-walz-navy/10 transition-colors">
          Retry
        </button>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-walz-muted-strong text-sm px-6 text-center">
        {emptyHint ?? 'No messages yet — say hello.'}
      </div>
    )
  }

  const isBubbleMode = conversationType === 'DM'

  return (
    <div className="relative flex-1 min-h-0 bg-walz-off-white">
      <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto overscroll-contain py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {hasMore && (
          loadingOlder ? (
            <p className="flex items-center justify-center gap-1.5 text-[10px] text-walz-muted-strong py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading earlier messages…
            </p>
          ) : olderError ? (
            <p className="text-center text-[10px] text-walz-error py-2">
              Could not load earlier messages. <button onClick={onLoadOlder} className="underline font-semibold">Retry</button>
            </p>
          ) : (
            <button onClick={onLoadOlder} className="block mx-auto text-[10px] text-walz-muted-strong hover:text-walz-navy py-2">
              Load earlier messages
            </button>
          )
        )}
        {!hasMore && <p className="text-center text-[10px] text-walz-muted-strong py-2">Beginning of conversation</p>}

        {isBubbleMode ? (
          messages.map(msg => (
            <BubbleRow
              key={msg.id}
              message={msg}
              isMine={msg.authorId === currentStaffId}
              currentStaffId={currentStaffId}
              conversationId={conversationId}
              editing={editingId === msg.id}
              onStartEdit={() => setEditingId(msg.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={async body => { const r = await onEdit(msg.id, body); if (r.ok) setEditingId(null); return r }}
              onDelete={() => void onDelete(msg.id)}
              onReact={emoji => void handleReact(msg.id, emoji)}
              onOpenThread={() => onOpenThread(msg.id)}
            />
          ))
        ) : (
          groupMessagesBySender(messages).map(group => (
            <GroupedRows
              key={`${group.authorId}-${group.messages[0]?.id}`}
              group={group}
              currentStaffId={currentStaffId}
              conversationId={conversationId}
              editingId={editingId}
              onStartEdit={setEditingId}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={async (id, body) => { const r = await onEdit(id, body); if (r.ok) setEditingId(null); return r }}
              onDelete={id => void onDelete(id)}
              onReact={(id, emoji) => void handleReact(id, emoji)}
              onOpenThread={onOpenThread}
            />
          ))
        )}
      </div>

      {showNewIndicator && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg"
        >
          New messages <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      {reactionError && (
        <div role="alert" className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-medium shadow-lg">
          {reactionError}
        </div>
      )}
    </div>
  )
}

// ── Bubble mode (DM) ─────────────────────────────────────────────────────────

interface BubbleRowProps {
  message: TeamMessage
  isMine: boolean
  currentStaffId?: string | null
  conversationId: string
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (body: string) => Promise<{ ok: boolean; error?: string }>
  onDelete: () => void
  onReact: (emoji: string) => void
  onOpenThread: () => void
}

function BubbleRow({ message, isMine, currentStaffId, conversationId, editing, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onReact, onOpenThread }: BubbleRowProps) {
  const [draft, setDraft] = useState(message.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    const r = await onSaveEdit(draft)
    setSaving(false)
    if (!r.ok) setError(r.error ?? 'Could not save.')
  }

  return (
    <div className={`group flex gap-2.5 px-4 py-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-walz-navy flex items-center justify-center text-[10px] font-bold text-walz-gold flex-shrink-0 mt-1">
          {initials(message.authorName)}
        </div>
      )}
      <div className={`max-w-[85%] md:max-w-[72%] ${isMine ? 'items-end flex flex-col' : ''}`}>
        {editing ? (
          <div className="w-full space-y-1">
            <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2} className="w-full rounded-lg border border-walz-border px-2 py-1.5 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500/40 rounded" />
            {error && <p className="text-[11px] text-walz-error">{error}</p>}
            <div className="flex gap-1.5">
              <button onClick={() => void save()} disabled={saving || !draft.trim()} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
              </button>
              <button onClick={onCancelEdit} className="flex items-center gap-1 text-[11px] font-semibold text-walz-muted-strong"><X className="w-3 h-3" /> Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {message.deleted ? (
              <p className="text-sm italic text-walz-muted-strong px-1">Message deleted</p>
            ) : (
              <>
                {message.body?.trim() && (
                  <div className={`rounded-2xl px-3.5 py-2.5 ${isMine ? 'bg-blue-50 border border-blue-200/60 rounded-tr-sm' : 'bg-white border border-walz-border rounded-tl-sm'} text-walz-deep-navy`}>
                    <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                  </div>
                )}
                <AttachmentList conversationId={conversationId} message={message} />
              </>
            )}
            <ReactionRow reactions={message.reactions} currentStaffId={currentStaffId} onReact={onReact} />
            {message.replyCount > 0 && (
              <button onClick={onOpenThread} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline w-fit">
                <MessageSquareText className="w-3 h-3" /> {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
        )}
        <div className={`flex items-center gap-1.5 mt-0.5 ${isMine ? 'justify-end' : ''}`}>
          <span className="text-[10px] text-walz-muted-strong">{formatTime(message.createdAt)}{message.editedAt ? ' · edited' : ''}</span>
          {!message.deleted && !editing && (
            <RowActions
              message={message} isMine={isMine}
              onReply={onOpenThread} onReact={onReact}
              onStartEdit={onStartEdit} onDelete={onDelete}
            />
          )}
        </div>
      </div>
      {isMine && (
        <div className="w-7 h-7 rounded-full bg-walz-navy flex items-center justify-center text-[10px] font-bold text-walz-gold flex-shrink-0 mt-1">
          {initials(message.authorName)}
        </div>
      )}
    </div>
  )
}

// ── Grouped-row mode (GROUP/CHANNEL) ────────────────────────────────────────

interface GroupedRowsProps {
  group: { authorId: string; messages: TeamMessage[] }
  currentStaffId?: string | null
  conversationId: string
  editingId: string | null
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSaveEdit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>
  onDelete: (id: string) => void
  onReact: (id: string, emoji: string) => void
  onOpenThread: (id: string) => void
}

function GroupedRows({ group, currentStaffId, conversationId, editingId, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onReact, onOpenThread }: GroupedRowsProps) {
  const first = group.messages[0]
  if (!first) return null
  const authorName = first.authorName

  return (
    <div className="px-4 py-1.5 flex gap-2.5">
      <div className="w-8 h-8 rounded-full bg-walz-navy flex items-center justify-center text-[10px] font-bold text-walz-gold flex-shrink-0 mt-0.5">
        {initials(authorName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-walz-deep-navy">{authorName}</span>
          <span className="text-[10px] text-walz-muted-strong">{formatTime(first.createdAt)}</span>
        </div>
        <div className="space-y-1 mt-0.5">
          {group.messages.map(message => {
            const isMine = message.authorId === currentStaffId
            const editing = editingId === message.id
            return (
              <div key={message.id} className="group">
                {editing ? (
                  <InlineEditor
                    initial={message.body ?? ''}
                    onCancel={onCancelEdit}
                    onSave={body => onSaveEdit(message.id, body)}
                  />
                ) : message.deleted ? (
                  <p className="text-sm italic text-walz-muted-strong">Message deleted</p>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {message.body?.trim() && <p className="text-sm whitespace-pre-wrap text-walz-deep-navy">{message.body}</p>}
                      <AttachmentList conversationId={conversationId} message={message} />
                      <ReactionRow reactions={message.reactions} currentStaffId={currentStaffId} onReact={emoji => onReact(message.id, emoji)} />
                      {message.replyCount > 0 && (
                        <button onClick={() => onOpenThread(message.id)} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline w-fit mt-0.5">
                          <MessageSquareText className="w-3 h-3" /> {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                      {message.editedAt && <span className="text-[10px] text-walz-muted-strong">edited</span>}
                    </div>
                    <RowActions
                      message={message} isMine={isMine}
                      onReply={() => onOpenThread(message.id)}
                      onReact={emoji => onReact(message.id, emoji)}
                      onStartEdit={() => onStartEdit(message.id)}
                      onDelete={() => onDelete(message.id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InlineEditor({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (body: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    const r = await onSave(draft)
    setSaving(false)
    if (!r.ok) setError(r.error ?? 'Could not save.')
  }

  return (
    <div className="space-y-1">
      <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2} className="w-full rounded-lg border border-walz-border px-2 py-1.5 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500/40 rounded" />
      {error && <p className="text-[11px] text-walz-error">{error}</p>}
      <div className="flex gap-1.5">
        <button onClick={() => void save()} disabled={saving || !draft.trim()} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 disabled:opacity-40">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 text-[11px] font-semibold text-walz-muted-strong"><X className="w-3 h-3" /> Cancel</button>
      </div>
    </div>
  )
}
