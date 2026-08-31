'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link                                           from 'next/link'
import { Send, X, Loader2, Sparkles, ChevronRight }  from 'lucide-react'
import { cn }                                         from '@/lib/utils'
import type { PortalContextHint }                     from '@/lib/portal/portal-jade-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string }

interface FocusEntity { type: 'trip' | 'booking' | 'proposal'; id: string; label: string }

interface Props {
  displayName:        string
  focusEntity?:       FocusEntity
  hasBookings:        boolean
  hasProposals:       boolean
  hasActionsRequired: boolean
  initialContextHint: PortalContextHint
}

// ─── Suggested prompts (context-aware) ───────────────────────────────────────

function getSuggestedPrompts(p: Pick<Props, 'hasBookings' | 'hasProposals' | 'hasActionsRequired' | 'focusEntity'>): string[] {
  const base: string[] = ['What needs my attention?', 'Show my upcoming trips']
  if (p.focusEntity?.type === 'booking') return ['Is this booking confirmed?', 'What did I pay?', 'What should I do next?', 'Find alternative flights']
  if (p.focusEntity?.type === 'proposal') return ['Tell me about this proposal', 'What is included?', 'Help me decide', 'Continue planning']
  if (p.focusEntity?.type === 'trip') return ['What is the status of this trip?', 'Which parts are confirmed?', 'Find airport transfer', 'Find activities to add']
  if (p.hasActionsRequired) base.unshift('What do I need to do?')
  if (p.hasBookings)    base.push('Are my bookings confirmed?')
  if (p.hasProposals)   base.push('Tell me about my proposals')
  base.push('Find airport transfer', 'Find activities')
  return base.slice(0, 5)
}

// ─── Message renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-[#C9A84C] underline hover:text-[#b8943d]" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br/>')
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PortalJadeChat({
  displayName, focusEntity, hasBookings, hasProposals, hasActionsRequired, initialContextHint,
}: Props) {
  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [dismissed,  setDismissed]  = useState<boolean>(false)
  const [focus,      setFocus]      = useState<FocusEntity | undefined>(focusEntity)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  const prompts = getSuggestedPrompts({ hasBookings, hasProposals, hasActionsRequired, focusEntity: focus })

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => { inputRef.current?.focus() }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/jade/portal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: messages,
          contextHint: {
            tripId:     focus?.type === 'trip'     ? focus.id : initialContextHint.tripId,
            bookingId:  focus?.type === 'booking'  ? focus.id : initialContextHint.bookingId,
            proposalId: focus?.type === 'proposal' ? focus.id : initialContextHint.proposalId,
          },
        }),
      })

      if (res.status === 401) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Your session has expired. Please [sign in again](/login).' }])
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? "I couldn't process that. Please try again." }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm having a technical issue. Please try again in a moment." }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, loading, focus, initialContextHint])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearFocus = () => setFocus(undefined)

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0B1F3A] border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Jade</p>
            <p className="text-white/40 text-xs">Your Walz Travels concierge</p>
          </div>
          <Link href="/dashboard" className="text-white/40 hover:text-white/70 transition-colors text-xs">
            Back to portal
          </Link>
        </div>

        {/* Context chip */}
        {focus && !dismissed && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/25 text-[#C9A84C] text-xs font-medium">
              <span className="truncate max-w-[200px]">{focus.label}</span>
              <button onClick={clearFocus} aria-label="Clear context" className="flex-shrink-0 hover:text-white/70 transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation with Jade"
      >
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C9A84C]/20 to-[#C9A84C]/5 border border-[#C9A84C]/20 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-[#C9A84C]" />
            </div>
            <h2 className="text-white font-semibold text-lg mb-1">Hi {displayName} 👋</h2>
            <p className="text-white/40 text-sm max-w-xs">
              I&apos;m Jade, your personal Walz Travels concierge. I can help with your trips, bookings, proposals, and more.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0B1F3A]" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] lg:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-[#C9A84C] text-[#0B1F3A] font-medium rounded-br-sm'
                  : 'bg-[#0B1F3A] border border-white/8 text-white/90 rounded-bl-sm',
              )}
              // Note: renderMarkdown output is controlled server-returned text, not user HTML
              dangerouslySetInnerHTML={msg.role === 'assistant' ? { __html: renderMarkdown(msg.content) } : undefined}
            >
              {msg.role === 'user' ? msg.content : undefined}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0B1F3A]" />
            </div>
            <div className="bg-[#0B1F3A] border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5" aria-label="Jade is thinking">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggested prompts ──────────────────────────────────────────────── */}
      {isEmpty && (
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="flex flex-wrap gap-2">
            {prompts.map(p => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10 hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
              >
                {p}
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#0B1F3A]/80 border-t border-white/8 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Jade anything about your travel..."
            rows={1}
            disabled={loading}
            aria-label="Message to Jade"
            className="flex-1 bg-white/8 border border-white/12 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-[#C9A84C]/50 focus:ring-1 focus:ring-[#C9A84C]/30 transition-all disabled:opacity-50 max-h-32 overflow-y-auto leading-relaxed"
            style={{ minHeight: '42px' }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#C9A84C] text-[#0B1F3A] flex items-center justify-center hover:bg-[#b8943d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        <p className="text-white/20 text-[10px] text-center mt-2">
          Jade can help explain your portal. Always verify bookings at <Link href="/dashboard/bookings" className="underline hover:text-white/40">My Bookings</Link>.
        </p>
      </div>
    </div>
  )
}
