'use client'

/**
 * Walz Team Hub V1 — the message composer. Mirrors ReplyBox.tsx's visual
 * chrome (rounded input area, attach button, char count, blue-600 send
 * button) MINUS the Reply/Private-Note mode tabs (no such concept here)
 * PLUS: @mention autocomplete, an emoji-insert picker, the Jade writing
 * menu, the attachment button, and — only when an active inbox-link is
 * passed in — "Prepare Client Reply", a clearly-labeled hand-off to the
 * Inbox (never a send from here; see lib/team/client-reply-handoff.ts).
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { Send, ExternalLink, Users, Loader2, X } from 'lucide-react'
import { AttachmentTrigger, AttachmentPreview } from './AttachmentUpload'
import { ReactionPicker } from './ReactionPicker'
import { MentionAutocomplete } from './MentionAutocomplete'
import { JadeComposerMenu } from './JadeComposerMenu'
import { findMentionTrigger, applyMentionSelection, type MentionTrigger } from '../lib/mentionParse'
import { teamFetch, extractErrorMessage } from '../lib/teamFetch'
import { writePendingClientDraft } from '@/lib/team/client-reply-handoff'
import type { ActionResult } from '../hooks/useTeamMessages'
import type { TeamConversationMemberSummary } from '../types'

const MAX_CHARS = 8000

export interface ComposerProps {
  conversationId: string
  parentMessageId?: string | null
  disabled?: boolean
  disabledReason?: string
  placeholder?: string
  onSend: (body: string, mentionedStaffIds?: string[]) => Promise<ActionResult>
  onUploadAttachment: (file: File, caption?: string) => Promise<ActionResult>
  /** Present only when this conversation has an active (OPEN/ANSWERED) inbox clarification link. */
  activeInboxConversationId?: number | null
}

export function Composer({
  conversationId, parentMessageId = null, disabled, disabledReason, placeholder,
  onSend, onUploadAttachment, activeInboxConversationId,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null)
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [mentionResultCount, setMentionResultCount] = useState(0)

  const [prepareOpen, setPrepareOpen] = useState(false)
  const [prepareLoading, setPrepareLoading] = useState(false)
  const [prepareText, setPrepareText] = useState('')
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const [prepareDone, setPrepareDone] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  function refocus() {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      resize()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    resize()
    const cursor = e.target.selectionStart ?? value.length
    const trigger = findMentionTrigger(value, cursor)
    setMentionTrigger(trigger)
    setMentionActiveIndex(0)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionTrigger) {
      if (e.key === 'Escape') { setMentionTrigger(null); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionActiveIndex(i => Math.min(i + 1, Math.max(mentionResultCount - 1, 0))); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionActiveIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // Selection is applied by MentionAutocomplete's own onMouseDown for
        // clicks; for keyboard we need the currently-highlighted row, which
        // only the list component knows — handled via a synthetic click
        // dispatched to the active option below.
        const active = document.querySelector<HTMLElement>(`[data-idx="${mentionActiveIndex}"] button`)
        if (active) { e.preventDefault(); active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mentionTrigger) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleMentionSelect(member: TeamConversationMemberSummary) {
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? text.length
    if (!mentionTrigger) return
    const { text: nextText, cursor: nextCursor } = applyMentionSelection(text, mentionTrigger, cursor, member.name)
    setText(nextText)
    setMentionedIds(prev => Array.from(new Set([...prev, member.staffId])))
    setMentionTrigger(null)
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.setSelectionRange(nextCursor, nextCursor); resize() }
    })
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? text.length
    const next = text.slice(0, cursor) + emoji + text.slice(cursor)
    setText(next)
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.setSelectionRange(cursor + emoji.length, cursor + emoji.length); resize() }
    })
  }

  function replaceDraft(next: string) {
    setText(next)
    refocus()
  }

  const canSend = !disabled && !sending && !uploading && (text.trim().length > 0 || file !== null)

  async function handleSend() {
    if (!canSend) return
    setSendError(null)
    if (file) {
      setUploading(true)
      setUploadError(null)
      const result = await onUploadAttachment(file, text)
      setUploading(false)
      if (!result.ok) { setUploadError(result.error ?? 'Upload failed.'); return }
      setFile(null)
      setText('')
      setMentionedIds([])
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }
    setSending(true)
    const result = await onSend(text.trim(), mentionedIds)
    setSending(false)
    if (!result.ok) { setSendError(result.error ?? null); return }
    setText('')
    setMentionedIds([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  async function openPrepareClientReply() {
    if (!activeInboxConversationId) return
    setPrepareOpen(true)
    setPrepareLoading(true)
    setPrepareError(null)
    setPrepareDone(false)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/jade-prepare-client-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxConversationId: activeInboxConversationId, teamMessageId: parentMessageId ?? undefined }),
      })
      if (!res.ok) { setPrepareError(await extractErrorMessage(res, 'Jade could not prepare a client reply.')); return }
      const data = (await res.json()) as { suggestion: string }
      setPrepareText(data.suggestion)
    } catch {
      setPrepareError('Jade could not prepare a client reply.')
    } finally {
      setPrepareLoading(false)
    }
  }

  function confirmHandoff() {
    if (!activeInboxConversationId) return
    writePendingClientDraft(activeInboxConversationId, prepareText)
    setPrepareDone(true)
  }

  return (
    <div className="border-t border-walz-border bg-white relative">
      {disabled && disabledReason && (
        <p className="px-3 pt-2 text-xs text-walz-muted-strong">{disabledReason}</p>
      )}

      {file && (
        <AttachmentPreview file={file} uploading={uploading} error={uploadError} onRemove={() => { setFile(null); setUploadError(null) }} />
      )}

      <div className="p-3">
        <div className="rounded-xl border border-walz-border bg-walz-off-white/60 relative">
          {mentionTrigger && (
            <MentionAutocomplete
              conversationId={conversationId}
              query={mentionTrigger.query}
              activeIndex={mentionActiveIndex}
              onResults={setMentionResultCount}
              onSelect={handleMentionSelect}
            />
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder={placeholder ?? 'Message… (Enter to send, Shift+Enter for newline, @ to mention)'}
            rows={2}
            maxLength={MAX_CHARS}
            aria-label="Message"
            className="w-full bg-transparent px-3 pt-3 pb-1 text-sm resize-none outline-none placeholder-walz-muted-strong text-walz-deep-navy focus:ring-2 focus:ring-blue-500/40 rounded"
            style={{ maxHeight: 140, overflowY: 'auto' }}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-walz-muted-strong px-1">{text.length}/{MAX_CHARS}</span>
              <AttachmentTrigger onSelect={f => setFile(f)} disabled={disabled} />
              <ReactionPicker label="Insert emoji" onPick={insertEmoji} />
              <JadeComposerMenu
                conversationId={conversationId}
                getDraft={() => text}
                onReplace={replaceDraft}
                parentMessageId={parentMessageId}
                disabled={disabled}
              />
              {activeInboxConversationId != null && (
                <button
                  type="button"
                  onClick={() => void openPrepareClientReply()}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
                  title="Prepare a client-facing reply — hands off to the Inbox for review and send"
                >
                  <Users className="w-3.5 h-3.5 text-walz-gold" /> Prepare Client Reply
                </button>
              )}
            </div>
            <button
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="w-3 h-3" />
              {sending || uploading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
        {sendError && <p className="mt-1 text-[11px] text-walz-error">{sendError}</p>}
      </div>

      {prepareOpen && (
        <div className="absolute inset-0 z-30 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-walz-border">
            <p className="text-sm font-bold text-walz-deep-navy flex items-center gap-1.5">
              <Users className="w-4 h-4 text-walz-gold" /> Prepare Client Reply
            </p>
            <button onClick={() => setPrepareOpen(false)} aria-label="Close" className="min-w-[32px] min-h-[32px] flex items-center justify-center text-walz-muted-strong hover:text-walz-navy">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-walz-muted-strong">
              This never sends anything from Team Hub — it hands the draft to the Inbox, where a human still has to press Send.
            </p>
            {prepareLoading ? (
              <p className="text-xs text-walz-muted-strong flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</p>
            ) : prepareError ? (
              <p className="text-xs text-walz-error">{prepareError}</p>
            ) : prepareDone ? (
              <div className="space-y-3">
                <p className="text-sm text-walz-navy">Draft handed off. Review and send it from the Inbox.</p>
                <a
                  href={`/admin/inbox?c=${activeInboxConversationId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-walz-border px-3 py-2 text-sm font-semibold text-walz-navy hover:bg-walz-navy/5"
                >
                  Open Client Conversation <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <>
                <textarea
                  value={prepareText}
                  onChange={e => setPrepareText(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-walz-border px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500/40 rounded"
                />
                <button
                  onClick={confirmHandoff}
                  disabled={!prepareText.trim()}
                  className="w-full rounded-lg bg-blue-600 text-white text-sm font-semibold py-2 disabled:opacity-40"
                >
                  Send to Inbox draft for review
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
