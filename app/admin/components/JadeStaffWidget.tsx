'use client'
import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type Message = {
  role: 'user' | 'assistant'
  content: string
  time: Date
}

const PAGE_HINTS: Record<string, { label: string; suggestions: string[] }> = {
  'dashboard': {
    label: '📊 Dashboard',
    suggestions: [
      "Which clients are waiting on me?",
      "Any urgent visa applications?",
      "Summarise today's workload",
    ],
  },
  'visa-applications': {
    label: '🛂 Visa Applications',
    suggestions: [
      "Canada visa requirements for Nigerians",
      "UK visitor visa processing time 2026",
      "What documents does Schengen need?",
      "Draft a document request email",
    ],
  },
  'payments': {
    label: '💳 Payments',
    suggestions: [
      "Draft a payment reminder email",
      "How do I explain payment plans to clients?",
      "What's the refund policy?",
    ],
  },
  'trip-requests': {
    label: '📋 Trip Requests',
    suggestions: [
      "Best time to visit Dubai?",
      "Draft a follow-up message for a client",
      "What's popular for Nigerian clients?",
    ],
  },
  'tickets': {
    label: '🎫 Tickets',
    suggestions: [
      "What is a dummy ticket?",
      "When do flight tickets expire for visa?",
      "Draft an explanation for a client",
    ],
  },
}

function getPageContext(pathname: string) {
  for (const [key, val] of Object.entries(PAGE_HINTS)) {
    if (pathname.includes(key)) return val
  }
  return {
    label: '🏠 Admin',
    suggestions: [
      "Visa requirements for any country",
      "Draft a client email",
      "Best time to visit a destination?",
    ],
  }
}

export function JadeStaffWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Hide on itinerary builder — those pages have Jade Copilot instead
  const isItineraryBuilder =
    pathname.includes('/itinerary-planner/') &&
    pathname.split('/').filter(Boolean).length > 3

  const context = getPageContext(pathname)

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true)
      const hour = new Date().getHours()
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
      setMessages([{
        role: 'assistant',
        content: `${greet}! I'm Jade ✈️\n\nI can help with:\n• Visa requirements & processing times\n• Drafting emails to clients\n• Destination & travel knowledge\n• Quick operational questions\n\nHow can I help?`,
        time: new Date(),
      }])
    }
  }, [open, initialized])

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/jade/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: { page: pathname },
          conversationHistory: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content.substring(0, 400),
          })),
        }),
      })

      const data = await res.json() as { response?: string; error?: string }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || data.error || 'No response received.',
        time: new Date(),
      }])
      if (!open) setUnread(n => n + 1)
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${err instanceof Error ? err.message : 'Something went wrong'}. Please try again.`,
        time: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  if (isItineraryBuilder) return null

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-5 w-[340px] bg-[#0A1628] border border-white/[0.12] rounded-2xl shadow-2xl z-[999] flex flex-col"
          style={{ height: '480px', maxHeight: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 flex-shrink-0">
            <div className="relative">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-sm">✈️</span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#0A1628]" />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm leading-none">Jade</p>
              <p className="text-white/30 text-xs mt-0.5">{context.label}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition text-sm"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs">
                    ✈️
                  </div>
                )}
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-black font-medium rounded-tr-sm'
                    : 'bg-white/[0.06] text-white/80 rounded-tl-sm'
                }`}>
                  {msg.content.split('\n').map((line, j) => (
                    <p key={j} className={
                      line.startsWith('•') ? 'text-white/60 ml-1' :
                      line.startsWith('❌') ? 'text-red-400' : ''
                    }>
                      {line || <br />}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center text-xs flex-shrink-0">
                  ✈️
                </div>
                <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick suggestions */}
          {messages.length <= 1 && !loading && (
            <div className="px-3 pb-2 flex-shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {context.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => void send(s)}
                    className="text-xs text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-full px-2.5 py-1 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-white/[0.08] flex-shrink-0">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Ask me anything..."
                rows={2}
                className="w-full bg-white/[0.06] border border-white/10 focus:border-amber-500/40 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none resize-none pr-10"
              />
              <button
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className={`absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center transition ${
                  loading || !input.trim()
                    ? 'bg-white/5 text-white/15'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button onClick={() => setOpen(o => !o)} className="fixed bottom-5 right-5 z-[1000] group">
        {unread > 0 && (
          <div className="absolute inset-0 rounded-full bg-amber-500/40 animate-ping" />
        )}

        <div className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 relative ${
          open
            ? 'bg-[#0A1628] border-2 border-white/20'
            : 'bg-gradient-to-br from-amber-400 to-amber-600 hover:scale-110'
        }`}>
          {open ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <span className="text-2xl">✈️</span>
          )}

          {unread > 0 && !open && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{unread}</span>
            </div>
          )}
        </div>

        {!open && (
          <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-[#0A1628] border border-white/10 rounded-xl px-3 py-2 whitespace-nowrap shadow-lg">
              <p className="text-white text-xs font-bold">Jade ✈️</p>
              <p className="text-white/40 text-xs">Staff Assistant</p>
            </div>
          </div>
        )}
      </button>
    </>
  )
}
