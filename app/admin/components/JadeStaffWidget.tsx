'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

type Message = {
  role: 'user' | 'assistant'
  content: string
  time: Date
  suggestions?: string[]
}

type JadeState = 'idle' | 'thinking'

const GREETINGS = [
  (name: string) => `Hey ${name} 👋 What do you need?`,
  (name: string) => `${name}! What's up?`,
  (name: string) => `Right, what can I help with ${name}?`,
  (name: string) => `Hey — good to see you ${name}. Fire away.`,
]

const THINKING_PHRASES = [
  'On it...',
  'Just a sec...',
  'Let me think...',
  'Checking...',
  'Got it, one moment...',
]

// ─── Message renderer ─────────────────────────────────────────────────────────

function renderMessage(content: string): React.ReactNode[] {
  return content.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />

    // Parse inline bold **text**
    const parseBold = (text: string): React.ReactNode => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g)
      return (
        <>
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>
              : <span key={j}>{p}</span>
          )}
        </>
      )
    }

    // Admin path highlighting
    if (line.trim().startsWith('/admin/') || line.trim().startsWith('→ /admin/')) {
      return (
        <p key={i} className="text-amber-400/80 font-mono text-[11px] leading-relaxed bg-amber-500/5 px-2 py-0.5 rounded my-0.5">
          {line}
        </p>
      )
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <p key={i} className="flex gap-2 text-white/80 leading-relaxed">
          <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
          <span>{parseBold(line.replace(/^[-•]\s/, ''))}</span>
        </p>
      )
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^\d+/)?.[0] ?? ''
      return (
        <p key={i} className="flex gap-2 text-white/80 leading-relaxed">
          <span className="text-amber-400 font-bold flex-shrink-0 min-w-[16px]">{num}.</span>
          <span>{parseBold(line.replace(/^\d+\.\s/, ''))}</span>
        </p>
      )
    }

    return (
      <p key={i} className="text-white/80 leading-relaxed">
        {parseBold(line)}
      </p>
    )
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JadeStaffWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [jadeState, setJadeState] = useState<JadeState>('idle')
  const [unread, setUnread] = useState(0)
  const [staffName, setStaffName] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [thinkingPhrase] = useState(
    () => THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
  )

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<Message[]>([])

  // Sync history to ref (avoids stale closure in send)
  useEffect(() => { historyRef.current = messages }, [messages])

  // Hide on itinerary builder — that page has Jade Copilot instead
  const isBuilder = pathname.includes('/itinerary-planner/')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, jadeState])

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true)
      void initializeJade()
    }
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open, initialized])

  const initializeJade = async () => {
    try {
      const res = await fetch('/api/admin/jade/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '__init__',
          context: { page: pathname },
          conversationHistory: [],
        }),
      })
      const data = await res.json() as { staffName?: string; suggestions?: string[] }
      const name = data.staffName || 'there'
      setStaffName(name)
      setSuggestions(data.suggestions || [])

      const greetFn = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
      setMessages([{
        role: 'assistant',
        content: greetFn(name),
        time: new Date(),
        suggestions: data.suggestions || [],
      }])
    } catch {
      setMessages([{ role: 'assistant', content: "Hey, what do you need?", time: new Date() }])
    }
  }

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || msg === '__init__' || jadeState !== 'idle') return

    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }])
    setInput('')
    setJadeState('thinking')

    try {
      const res = await fetch('/api/admin/jade/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: { page: pathname },
          conversationHistory: historyRef.current
            .slice(-8)
            .map(m => ({ role: m.role, content: m.content.substring(0, 500) })),
        }),
      })

      const data = await res.json() as {
        response?: string
        error?: string
        staffName?: string
        suggestions?: string[]
      }

      if (data.error) throw new Error(data.error)

      if (data.staffName && !staffName) setStaffName(data.staffName)
      if (data.suggestions?.length) setSuggestions(data.suggestions)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || '',
        time: new Date(),
        suggestions: data.suggestions,
      }])
      if (!open) setUnread(n => n + 1)
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Hmm, something went wrong on my end. Try again? (${err instanceof Error ? err.message : 'unknown error'})`,
        time: new Date(),
      }])
    } finally {
      setJadeState('idle')
    }
  }, [input, jadeState, pathname, staffName, open])

  if (isBuilder) return null

  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-[999] flex flex-col"
          style={{ width: 360, height: 520, maxHeight: 'calc(100vh - 100px)' }}
        >
          <div className="flex flex-col h-full bg-[#0C1829] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08] bg-[#0C1829] flex-shrink-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-full overflow-hidden shadow-lg bg-[#e8eef6] flex-shrink-0">
                  <img src="/jade-avatar.png" alt="Jade" className="w-full h-full object-cover object-[center_8%]" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0C1829]" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm leading-none">Jade</p>
                <p className="text-green-400 text-xs mt-0.5 font-medium">Online · Walz Travels</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 bg-[#e8eef6]">
                      <img src="/jade-avatar.png" alt="Jade" className="w-full h-full object-cover object-[center_8%]" />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 max-w-[85%]">
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed space-y-0.5 ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-black font-medium rounded-tr-sm'
                        : 'bg-white/[0.07] text-white/85 rounded-tl-sm border border-white/[0.05]'
                    }`}>
                      {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                    </div>
                    <p className={`text-[10px] text-white/20 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {fmt(msg.time)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Thinking */}
              {jadeState === 'thinking' && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-[#e8eef6]">
                    <img src="/jade-avatar.png" alt="Jade" className="w-full h-full object-cover object-[center_8%]" />
                  </div>
                  <div className="bg-white/[0.07] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        ))}
                      </div>
                      <span className="text-white/30 text-xs">{thinkingPhrase}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick suggestions — only after first message */}
            {suggestions.length > 0 && messages.length <= 1 && jadeState === 'idle' && (
              <div className="px-4 pb-2 flex-shrink-0">
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => void send(s)}
                      className="text-left text-xs text-white/40 hover:text-white/70 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.15] rounded-xl px-3 py-2 transition leading-relaxed"
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
                  placeholder={staffName ? `Ask Jade anything, ${staffName}...` : 'Ask Jade anything...'}
                  rows={2}
                  disabled={jadeState !== 'idle'}
                  className="w-full bg-white/[0.06] border border-white/10 focus:border-amber-500/40 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none resize-none pr-10 disabled:opacity-50"
                />
                <button
                  onClick={() => void send()}
                  disabled={jadeState !== 'idle' || !input.trim()}
                  className={`absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center transition ${
                    jadeState !== 'idle' || !input.trim()
                      ? 'bg-white/5 text-white/15'
                      : 'bg-amber-500 hover:bg-amber-400 text-black shadow-md'
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
              <p className="text-white/10 text-xs mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button onClick={() => setOpen(o => !o)} className="fixed bottom-5 right-5 z-[1000] group">
        {unread > 0 && !open && (
          <div className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" />
        )}

        <div className={`relative w-14 h-14 rounded-full shadow-2xl overflow-hidden transition-all duration-200 ${
          open
            ? 'ring-2 ring-white/20'
            : 'hover:scale-110 hover:shadow-xl hover:shadow-black/40'
        }`}>
          {open ? (
            <div className="w-full h-full bg-[#0C1829] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ) : (
            <img src="/jade-avatar.png" alt="Jade" className="w-full h-full object-cover object-[center_8%]" />
          )}

          {unread > 0 && !open && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white">
              <span className="text-white text-xs font-bold">{unread > 9 ? '9+' : unread}</span>
            </div>
          )}
        </div>

        {/* Tooltip */}
        {!open && (
          <div className="absolute bottom-full right-0 mb-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <div className="bg-[#0C1829] border border-white/10 rounded-xl px-3.5 py-2.5 shadow-xl whitespace-nowrap">
              <p className="text-white font-bold text-xs">Jade</p>
              <p className="text-white/40 text-xs mt-0.5">Staff Assistant · Always on</p>
            </div>
            <div className="w-2 h-2 bg-[#0C1829] border-r border-b border-white/10 rotate-45 ml-auto mr-4 -mt-1" />
          </div>
        )}
      </button>
    </>
  )
}
