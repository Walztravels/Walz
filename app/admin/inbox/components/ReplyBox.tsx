'use client'
import { useEffect, useState, useRef, KeyboardEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Lock, Paperclip, X, FileText, Wand2, Users } from 'lucide-react'
import { useComposerDraft } from '../ComposerDraftContext'
import { consumePendingClientDraft } from '@/lib/team/client-reply-handoff'

interface Props {
  onSend: (content: string, isPrivate: boolean, file?: File) => Promise<void | boolean>
  disabled?: boolean
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'

export function ReplyBox({ onSend, disabled }: Props) {
  const [mode, setMode]       = useState<'reply' | 'note'>('reply')
  const [text, setText]       = useState('')
  const [file, setFile]       = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UX-2: Jade talks to the composer through the draft context — the
  // ChatWindow → ReplyBox JSX line is pinned, so no new props here.
  const { registerInserter, openCopilot, registerReplacer, registerTextProvider, openJadeMenu, openAskTeam } = useComposerDraft()

  function refocusAndResize() {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  useEffect(() => {
    registerInserter((draft: string) => {
      setMode('reply')
      setText(prev => (prev.trim() ? `${prev}\n\n${draft}` : draft))
      refocusAndResize()
    })
  }, [registerInserter])

  // V1.4 — Jade writing-assist transforms (Fix Writing/Professionalize/tone/
  // Translate) act on whatever staff already typed and REPLACE it outright,
  // never appending like insertDraft does. Deliberately does NOT touch
  // `mode` — a private note must never silently become a reply (or vice
  // versa) just because a transform was applied (owner decision 14).
  useEffect(() => {
    registerReplacer((next: string) => {
      setText(next)
      refocusAndResize()
    })
  }, [registerReplacer])

  useEffect(() => {
    registerTextProvider(() => ({ text, mode }))
  }, [registerTextProvider, text, mode])

  // Team Hub "Prepare Client Reply" handoff — see lib/team/client-reply-handoff.ts.
  // Consumed at most once per conversation id; never auto-sends, only prefills
  // for staff to review (owner "NO AUTO-SEND" invariant).
  const searchParams = useSearchParams()
  useEffect(() => {
    const conversationId = searchParams.get('c') ?? searchParams.get('lead')
    if (!conversationId) return
    const pending = consumePendingClientDraft(conversationId)
    if (!pending) return
    setMode('reply')
    setText(prev => (prev.trim() ? prev : pending))
    refocusAndResize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const isPrivate = mode === 'note'
  const canSend   = (text.trim().length > 0 || file !== null) && !sending && !disabled

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    try {
      await onSend(text.trim(), isPrivate, file ?? undefined)
      setText('')
      setFile(null)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    e.target.value = ''
  }

  const isImage = file?.type.startsWith('image/')

  return (
    <div className="border-t border-walz-border bg-white">
      {/* Mode tabs */}
      <div className="flex border-b border-walz-border/60">
        <button
          onClick={() => setMode('reply')}
          className={`px-4 py-2 text-xs font-semibold transition-colors ${
            mode === 'reply' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-walz-muted-strong hover:text-walz-navy'
          }`}
        >
          Reply
        </button>
        <button
          onClick={() => setMode('note')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-1 transition-colors ${
            mode === 'note' ? 'text-amber-700 border-b-2 border-amber-600' : 'text-walz-muted-strong hover:text-walz-navy'
          }`}
        >
          <Lock className="w-3 h-3" /> Private Note
        </button>
      </div>

      {/* File preview */}
      {file && (
        <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-walz-off-white border border-walz-border">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="h-10 w-10 object-cover rounded"
            />
          ) : (
            <FileText className="w-5 h-5 text-walz-gold flex-shrink-0" />
          )}
          <span className="text-xs text-walz-navy truncate flex-1">{file.name}</span>
          <span className="text-[10px] text-walz-muted-strong flex-shrink-0">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button onClick={() => setFile(null)} className="text-walz-muted-strong hover:text-walz-navy flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3">
        <div className={`rounded-xl border transition-colors ${
          isPrivate ? 'border-amber-500/50 bg-amber-500/10' : 'border-walz-border bg-walz-off-white/60'
        }`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKey}
            disabled={disabled || sending}
            placeholder={isPrivate ? 'Write a private note (only visible to staff)...' : 'Reply to client… (Enter to send, Shift+Enter for newline)'}
            rows={2}
            className={`w-full bg-transparent px-3 pt-3 pb-1 text-sm resize-none outline-none placeholder-walz-muted-strong ${
              isPrivate ? 'text-amber-900' : 'text-walz-deep-navy'
            }`}
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-walz-muted-strong">{text.length} chars</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || sending}
                title="Attach file or image"
                className="text-walz-muted-strong hover:text-walz-gold transition-colors disabled:opacity-40"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Ask Jade — compact LABELED chip on mobile (UX-2 polish: the
                  bare sparkle was undiscoverable). M3 contrast: sparkle stays
                  gold, the word reads in muted-strong. 44px touch target;
                  ~64px wide, so [+] 44 + textarea flex-1 + chip + Send fit 390. */}
              <button
                type="button"
                onClick={openCopilot}
                title="Ask Jade"
                aria-label="Ask Jade"
                className="md:hidden min-w-[44px] min-h-[44px] -my-3 flex items-center justify-center gap-1 px-1.5 rounded-lg text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
              >
                <span className="text-walz-gold text-sm leading-none">✨</span> Jade
              </button>
              {/* V1.4 — a SEPARATE structured writing-assist menu (Fix Writing,
                  tone changes, Translate, Draft Reply, Summarize, Suggested
                  Actions), distinct from the free-form "Ask Jade" chat above.
                  Distinguished by icon (wand, not sparkle) and label ("Write"
                  vs "Jade") so staff can tell the two triggers apart — never
                  icon-only (see the "bare sparkle was undiscoverable" note
                  on the button above; the same mistake applies here). */}
              <button
                type="button"
                onClick={openJadeMenu}
                title="Write with Jade"
                aria-label="Write with Jade"
                className="md:hidden min-w-[44px] min-h-[44px] -my-3 flex items-center justify-center gap-1 px-1.5 rounded-lg text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5 text-blue-600" /> Write
              </button>
              {/* Team Hub — "Ask Team" opens the AskTeamPanel to message a
                  colleague / ask a channel / start an internal discussion
                  about this client conversation. A SEPARATE, additive
                  trigger from the two Jade buttons above — distinguished by
                  icon (people, not sparkle/wand) and label. */}
              <button
                type="button"
                onClick={openAskTeam}
                title="Ask Team"
                aria-label="Ask Team"
                className="md:hidden min-w-[44px] min-h-[44px] -my-3 flex items-center justify-center gap-1 px-1.5 rounded-lg text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-emerald-600" /> Team
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              <Send className="w-3 h-3" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        {/* Slim bottom row — Staff Jade entry (desktop). UX-2 polish: a proper
            compact secondary action (bordered ghost), clearly secondary to the
            blue Send. No FAB. */}
        <div className="hidden md:flex items-center pt-1.5">
          {/* M3 contrast: the words read in muted-strong (gold text fails AA
              at this size) — only the sparkle stays gold. */}
          <button
            type="button"
            onClick={openCopilot}
            className="flex items-center gap-1 border border-walz-border rounded-lg px-2.5 py-1.5 hover:bg-walz-navy/5 text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy transition-colors"
          >
            <span className="text-walz-gold">✨</span> Ask Jade
          </button>
          {/* V1.4 — separate structured writing-assist trigger, next to but
              visually distinct from Ask Jade (icon + label both differ). */}
          <button
            type="button"
            onClick={openJadeMenu}
            className="ml-1.5 flex items-center gap-1 border border-walz-border rounded-lg px-2.5 py-1.5 hover:bg-walz-navy/5 text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy transition-colors"
          >
            <Wand2 className="w-3 h-3 text-blue-600" /> Write with Jade
          </button>
          {/* Team Hub — desktop "Ask Team" trigger, additive sibling to the
              two Jade buttons above. */}
          <button
            type="button"
            onClick={openAskTeam}
            className="ml-1.5 flex items-center gap-1 border border-walz-border rounded-lg px-2.5 py-1.5 hover:bg-walz-navy/5 text-[11px] font-semibold text-walz-muted-strong hover:text-walz-navy transition-colors"
          >
            <Users className="w-3 h-3 text-emerald-600" /> Ask Team
          </button>
        </div>
      </div>
    </div>
  )
}
