'use client'

// InboxJadeCopilot — INBOX UX-2 Phase B: the real Staff Jade copilot.
//
// Reuses the EXISTING staff engine (POST /api/admin/jade/chat) through the
// shared useStaffJadeChat hook — no new AI surface. Layout contract from the
// UX-2 stub is unchanged:
//   - desktop (lg+): right-side peer panel (w-[400px]) that takes the
//     ClientInfo rail's slot while open (the page hides the rail);
//   - mobile: fixed bottom sheet (max-h-[80dvh]) behind a scrim, above the
//     bottom nav below md (the nav offset var already includes the safe area)
//     and anchored bottom-0 from md up; drawer layer of the chrome z (z-[60]).
//
// Safety invariants (test-pinned):
//   - INTERNAL ONLY: drafts go to the composer via useComposerDraft().insertDraft
//     for staff review — this component NEVER fetches any /conversations/*
//     reply endpoint and never auto-sends anything to a client;
//   - clearSession() runs whenever conversationId changes, so a previous
//     client's context never leaks into another conversation;
//   - the transcript rides in context.conversation and is fenced as untrusted
//     data server-side.

import { useEffect, useRef, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useStaffJadeChat } from '../../components/jade/useStaffJadeChat'
import { renderMessage } from '../../components/jade/renderMessage'
import { useComposerDraft } from '../ComposerDraftContext'

export interface InboxJadeCopilotProps {
  open: boolean
  onClose: () => void
  conversationId: number | null
  channel: string
  contactName: string
  contactEmail?: string | null
  contactPhone?: string | null
  recentMessages: Array<{ role: 'client' | 'agent'; text: string }>
}

// ─── Quick actions — canned prompts sent through the shared engine ──────────

const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Summarize conversation',
    prompt: 'Summarize this conversation for me: key requests, promises made, and anything unresolved.',
  },
  {
    label: 'Draft a reply',
    prompt: 'Draft a short, professional reply I can review before sending.',
  },
  {
    label: 'What does this client need?',
    prompt: 'What does this client need?',
  },
  {
    label: 'Check visa requirements',
    prompt: 'What visa requirements should I check for this client? Ask me for the destination if unclear.',
  },
  {
    label: 'Next best action',
    prompt: 'Based on this conversation, what is the next best action I should take for this client?',
  },
]

// ─── Related-application search (no AI — direct session-authed lookup) ──────

type AppSearchResult = {
  referenceNumber: string | null
  clientName: string
  status: string | null
  visaType: string | null
}

type SearchCard = {
  key: number
  /** Thread position: rendered after this many chat messages. */
  pos: number
  state: 'loading' | 'done' | 'error'
  query: string
  results: AppSearchResult[]
}

const SEARCH_EMPTY_STATE =
  'No matching application found — use Link Application in the client panel to search by Walz Ref.'

// ─── Component ───────────────────────────────────────────────────────────────

export function InboxJadeCopilot({
  open, onClose, conversationId, channel, contactName, contactEmail, contactPhone, recentMessages,
}: InboxJadeCopilotProps) {
  const { insertDraft } = useComposerDraft()

  const {
    messages,
    input,
    setInput,
    jadeState,
    staffName,
    send,
    initialize,
    clearSession,
    initialized,
    thinkingPhrase,
  } = useStaffJadeChat({
    sessionKey: 'walz_jade_inbox_session',
    contextBuilder: () => ({
      page: '/admin/inbox',
      ...(conversationId != null
        ? {
            conversation: {
              conversationId,
              channel,
              contactName,
              recentMessages,
            },
          }
        : {}),
    }),
  })

  const [searchCards, setSearchCards] = useState<SearchCard[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputElRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Focus management: on open, focus the Jade input after paint; on close,
  // restore focus to whatever had it before the panel opened.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      const raf = requestAnimationFrame(() => inputElRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
    restoreFocusRef.current?.focus?.()
    restoreFocusRef.current = null
  }, [open])

  // Esc closes the panel (both the desktop peer panel and the mobile sheet).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset the thread whenever the conversation changes — a previous client's
  // context must never bleed into another conversation.
  const prevConvIdRef = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (prevConvIdRef.current !== undefined && prevConvIdRef.current !== conversationId) {
      clearSession()
      setSearchCards([])
    }
    prevConvIdRef.current = conversationId
  }, [conversationId, clearSession])

  // Greet (fetch staffName + suggestions) when opened with a conversation.
  useEffect(() => {
    if (open && !initialized && conversationId != null) void initialize()
  }, [open, initialized, conversationId, initialize])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, searchCards, jadeState, open])

  const findRelatedApplication = async () => {
    const q = (contactName || contactEmail || contactPhone || '').trim()
    const key = Date.now()
    const pos = messages.length

    if (q.length < 2) {
      setSearchCards(prev => [...prev, { key, pos, state: 'done', query: q, results: [] }])
      return
    }

    setSearchCards(prev => [...prev, { key, pos, state: 'loading', query: q, results: [] }])
    try {
      const res = await fetch(`/api/admin/intelligence/client-search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('search failed')
      const data = await res.json() as { results?: AppSearchResult[] }
      const results = (data.results ?? []).filter(r => r.referenceNumber)
      setSearchCards(prev => prev.map(c => c.key === key ? { ...c, state: 'done', results } : c))
    } catch {
      setSearchCards(prev => prev.map(c => c.key === key ? { ...c, state: 'error' } : c))
    }
  }

  if (!open) return null

  const contextLine = conversationId
    ? [contactName, channel, `Conversation #${conversationId}`].filter(Boolean).join(' · ')
    : 'No conversation selected'

  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const renderSearchCard = (card: SearchCard) => (
    <div key={`card-${card.key}`} className="flex justify-start">
      <div className="max-w-[92%] w-full rounded-2xl rounded-tl-sm border border-walz-border bg-white px-3.5 py-2.5 text-xs">
        <p className="font-bold text-walz-deep-navy flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3 h-3 text-walz-gold" /> Related applications
        </p>
        {card.state === 'loading' && (
          <p className="text-walz-muted-strong">Searching applications…</p>
        )}
        {card.state === 'error' && (
          <p className="text-walz-error">Application search is unavailable right now — try again.</p>
        )}
        {card.state === 'done' && card.results.length === 0 && (
          <p className="text-walz-muted-strong">{SEARCH_EMPTY_STATE}</p>
        )}
        {card.state === 'done' && card.results.length > 0 && (
          <div className="space-y-1.5">
            {card.results.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-walz-off-white px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="font-semibold text-walz-deep-navy truncate">{r.clientName}</p>
                  <p className="text-[10px] text-walz-muted-strong truncate">
                    {[r.referenceNumber, r.visaType].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {r.status && (
                  <span className="flex-shrink-0 text-[10px] font-medium text-walz-navy bg-blue-50 rounded-full px-2 py-0.5">
                    {r.status}
                  </span>
                )}
              </div>
            ))}
            <p className="text-[10px] text-walz-muted-strong pt-0.5">
              Use Link Application in the client panel to attach one to this conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  )

  // Interleave: after chat message i, render any search cards inserted there.
  const cardsAt = (pos: number) => searchCards.filter(c => c.pos === pos).map(renderSearchCard)

  const inner = (
    <>
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-walz-border bg-white">
        <div className="min-w-0">
          <p className="text-sm font-bold text-walz-deep-navy flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-walz-gold" /> Staff Jade
          </p>
          <p className="text-[10px] text-walz-muted-strong">Ask Walz&apos;s internal assistant</p>
          <p className="text-[10px] text-walz-muted-strong truncate mt-0.5">{contextLine}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 bg-walz-off-white">
        {conversationId == null && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <Sparkles className="w-5 h-5 text-walz-gold" />
            <p className="text-sm text-walz-muted-strong">Select a conversation to ask Staff Jade about it</p>
          </div>
        )}

        {cardsAt(0)}
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col gap-1 max-w-[92%]">
                <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-0.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white font-medium rounded-tr-sm'
                    : 'bg-walz-deep-navy text-white/85 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                </div>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 px-1">
                    {/* Close after inserting — on mobile the keyboard would
                        otherwise pop under the open sheet; on desktop the
                        thread persists in session and reopens. */}
                    <button
                      onClick={() => { insertDraft(msg.content); onClose() }}
                      className="text-[10px] font-semibold text-walz-navy bg-white border border-walz-border hover:bg-blue-50 rounded-full px-2.5 py-1 transition-colors"
                    >
                      Insert into Reply
                    </button>
                    <span className="text-[10px] text-walz-muted-strong">{fmt(msg.time)}</span>
                  </div>
                )}
              </div>
            </div>
            {cardsAt(i + 1)}
          </div>
        ))}

        {/* Thinking */}
        {jadeState === 'thinking' && (
          <div className="flex justify-start">
            <div className="bg-walz-deep-navy rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
              <span className="text-white/40 text-[10px]">{thinkingPhrase}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1 border-t border-walz-border bg-white">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => void send(a.prompt)}
              disabled={jadeState !== 'idle' || conversationId == null}
              className="text-[10px] font-medium text-walz-navy bg-walz-off-white hover:bg-blue-50 border border-walz-border rounded-full px-2.5 py-1 transition-colors disabled:opacity-40"
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => void findRelatedApplication()}
            disabled={conversationId == null}
            className="text-[10px] font-medium text-walz-navy bg-walz-off-white hover:bg-blue-50 border border-walz-border rounded-full px-2.5 py-1 transition-colors disabled:opacity-40"
          >
            Find related application
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 bg-white">
        <div className="relative">
          <textarea
            ref={inputElRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Ask Jade anything…"
            rows={2}
            disabled={jadeState !== 'idle' || conversationId == null}
            className="w-full bg-walz-off-white border border-walz-border focus:border-blue-400 rounded-xl px-3.5 py-2.5 text-walz-deep-navy text-xs placeholder:text-walz-muted-strong/60 focus:outline-none resize-none pr-10 disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={jadeState !== 'idle' || !input.trim() || conversationId == null}
            aria-label="Send"
            className={`absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center transition ${
              jadeState !== 'idle' || !input.trim() || conversationId == null
                ? 'bg-walz-border/60 text-walz-muted-strong/50'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
            }`}
          >
            {jadeState === 'thinking' ? (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-walz-muted-strong/70 mt-1.5 text-center">
          {staffName ? `Drafts land in the composer for your review, ${staffName} — nothing is auto-sent.` : 'Drafts land in the composer for your review — nothing is auto-sent.'}
        </p>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop — peer panel replacing the ClientInfo rail slot */}
      <div className="hidden lg:flex flex-col w-[400px] flex-shrink-0 min-h-0 h-full bg-white border-l border-walz-border">
        {inner}
      </div>

      {/* Mobile/tablet scrim — same drawer z layer, painted before the sheet;
          tapping it closes the copilot */}
      <div
        className="lg:hidden fixed inset-0 bg-black/30 z-[60]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile — bottom sheet; z-[60] = Z_INDEX.drawer (lib/admin/chrome.ts).
          The bottom-nav offset (which already includes env(safe-area-inset-bottom))
          applies only below md — MobileNav is md:hidden, so from md up the sheet
          anchors to bottom-0. */}
      <div className="lg:hidden fixed inset-x-0 bottom-[var(--walz-bottom-nav-safe,0px)] md:bottom-0 max-h-[80dvh] bg-white border-t border-walz-border rounded-t-2xl shadow-2xl flex flex-col z-[60]">
        {inner}
      </div>
    </>
  )
}
