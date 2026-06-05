'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, MessageCircle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi there! I'm Jade, your Walz Travels assistant ✈️\n\nI'm here to help you plan your perfect trip — whether that's finding great flights, booking a private tour, sorting your visa, or recommending where to stay. What can I help you with today?",
}

const QUICK_ACTIONS = [
  { emoji: '✈️', label: 'Find flights',  msg: "I need help finding flights." },
  { emoji: '🗺️', label: 'Book a tour',  msg: "I'm interested in booking a private tour." },
  { emoji: '📋', label: 'Visa help',     msg: "I need help with visa requirements." },
  { emoji: '🏨', label: 'Hotels',        msg: "Can you recommend hotels for my trip?" },
]

// ── Avatar ────────────────────────────────────────────────────────────────────

function JadeAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #0B1F3A 0%, #1a3a5c 100%)',
        boxShadow: '0 0 0 2px #C9A84C55',
      }}
    >
      {/* Elegant female silhouette */}
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none">
        {/* Head */}
        <ellipse cx="16" cy="10" rx="5.5" ry="6" fill="#C9A84C" opacity="0.95" />
        {/* Hair */}
        <ellipse cx="16" cy="7" rx="6" ry="4" fill="#C9A84C" opacity="0.7" />
        <path d="M10.5 10 Q9 14 10 17" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <path d="M21.5 10 Q23 14 22 17" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        {/* Shoulders / body */}
        <path d="M8 28 Q8 20 16 20 Q24 20 24 28" fill="#C9A84C" opacity="0.85" />
        {/* Neck */}
        <rect x="14" y="16" width="4" height="4.5" rx="2" fill="#C9A84C" opacity="0.9" />
        {/* Collar detail */}
        <path d="M11 22 Q16 25 21 22" stroke="#0B1F3A" strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
      </svg>
    </div>
  )
}

// ── Typing dots ───────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg, isStreaming }: { msg: Message; isStreaming: boolean }) {
  const isUser = msg.role === 'user'
  const isEmpty = !msg.content

  // Detect WhatsApp mentions to show a quick-connect button
  const showWhatsApp =
    !isUser &&
    !isStreaming &&
    msg.content.toLowerCase().includes('whatsapp')

  return (
    <div className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && <JadeAvatar size={28} />}

      <div className={`max-w-[78%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words
            ${isUser
              ? 'bg-[#0B1F3A] text-white rounded-tr-sm'
              : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm'
            }`}
        >
          {isEmpty && isStreaming ? <TypingDots /> : msg.content}
        </div>

        {showWhatsApp && (
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z"/>
            </svg>
            Chat on WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function JadeChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [unread, setUnread] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input and clear unread badge when opened
  useEffect(() => {
    if (open) {
      setUnread(false)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  // Show unread dot after 8 s if chat never opened (gentle nudge)
  useEffect(() => {
    const t = setTimeout(() => { if (!open) setUnread(true) }, 8000)
    return () => clearTimeout(t)
  }, [open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed }
    const asstId = `a-${Date.now() + 1}`

    // Snapshot history + new user message for the API call
    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }))

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: asstId, role: 'assistant', content: '' },
    ])
    setInput('')
    setStreaming(true)

    try {
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      const res = await fetch('/api/chat/jade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('Bad response')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstId ? { ...m, content: m.content + chunk } : m
          )
        )
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? {
                ...m,
                content:
                  "I'm having a bit of trouble connecting right now. You can reach our team directly on WhatsApp at +447398753797 — they'll be happy to help!",
              }
            : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  const showQuickActions = messages.length <= 1 && !streaming

  return (
    <>
      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-[72px] right-4 sm:right-6 z-50
                     w-[calc(100vw-32px)] sm:w-[390px]
                     flex flex-col rounded-2xl overflow-hidden
                     shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-gray-100
                     bg-white jade-slide-up"
          style={{ maxHeight: 'min(580px, calc(100dvh - 100px))' }}
        >
          {/* Header */}
          <div className="bg-[#0B1F3A] px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="relative">
              <JadeAvatar size={42} />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0B1F3A]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-white font-bold text-sm leading-none">Jade</h3>
              </div>
              <p className="text-[#8B9BAE] text-[11px] mt-0.5">Walz Travels Assistant · Online now</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white transition-colors p-1"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F7F8FA] min-h-0">
            {messages.map((msg, i) => (
              <Bubble
                key={msg.id}
                msg={msg}
                isStreaming={streaming && i === messages.length - 1}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {showQuickActions && (
            <div className="px-4 pt-3 pb-2 bg-[#F7F8FA] border-t border-gray-200 flex-shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-medium">Quick help</p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map(({ emoji, label, msg }) => (
                  <button
                    key={label}
                    onClick={() => send(msg)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200
                               hover:border-[#C9A84C] hover:bg-[#C9A84C]/5
                               rounded-xl text-xs text-gray-700 font-medium
                               transition-all text-left shadow-sm"
                  >
                    <span className="text-base leading-none">{emoji}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="px-3 py-3 bg-white border-t border-gray-100 flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
                }}
                placeholder="Ask Jade anything…"
                disabled={streaming}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5
                           text-sm outline-none focus:border-[#C9A84C] focus:bg-white
                           transition-all placeholder-gray-400 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className="w-10 h-10 rounded-xl bg-[#C9A84C] hover:bg-[#d4b45f]
                           disabled:bg-gray-200 flex items-center justify-center
                           transition-colors flex-shrink-0 shadow-sm"
                aria-label="Send message"
              >
                {streaming
                  ? <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-[#0B1F3A]" />
                }
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-300 mt-2 leading-none">
              Powered by Walz Travels AI · walztravels.com
            </p>
          </form>
        </div>
      )}

      {/* ── Floating Button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Chat with Jade'}
        className={`fixed bottom-4 right-4 sm:right-6 z-50
                    flex items-center gap-2.5
                    pl-2.5 pr-4 py-2.5
                    rounded-full shadow-lg hover:shadow-xl
                    transition-all duration-200 font-bold text-sm
                    ${open
                      ? 'bg-[#0B1F3A] text-white pl-3.5'
                      : 'bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A]'
                    }`}
      >
        {open ? (
          <>
            <X className="w-4 h-4" />
            <span>Close</span>
          </>
        ) : (
          <>
            <div className="relative">
              <JadeAvatar size={30} />
              {unread && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-[#C9A84C] animate-pulse" />
              )}
            </div>
            <span>Chat with Jade</span>
            <MessageCircle className="w-4 h-4 opacity-70" />
          </>
        )}
      </button>
    </>
  )
}
