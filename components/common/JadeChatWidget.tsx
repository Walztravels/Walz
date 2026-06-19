'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  X, Send, Minimize2, Maximize2,
  Phone, Mail, Loader2, RotateCcw,
} from 'lucide-react'

interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  timestamp: Date
  intent?:   string
}

const QUICK_STARTERS = [
  '✈ Book a flight',
  '🏨 Find hotels',
  '🌍 Plan a holiday',
  '📋 Visa help',
  '🚗 Airport transfer',
]

const TYPING_PHRASES = [
  'Jade is thinking…',
  'Checking the best options…',
  'One moment…',
  'Looking into that for you…',
]

// Parse **bold** and [link text](url) in replies
function parseMarkdown(text: string) {
  const parts: Array<{ type: 'text' | 'bold' | 'link'; content: string; href?: string }> = []
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    if (match[1]) {
      parts.push({ type: 'bold', content: match[1] })
    } else if (match[2] && match[3]) {
      parts.push({ type: 'link', content: match[2], href: match[3] })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts.map((p, i) => {
    if (p.type === 'bold') {
      return <strong key={i} className="font-semibold text-[#0B1F3A]">{p.content}</strong>
    }
    if (p.type === 'link') {
      return (
        <a key={i} href={p.href}
          className="text-[#C9A84C] underline hover:no-underline font-medium"
          target={p.href?.startsWith('http') ? '_blank' : '_self'}
          rel="noopener noreferrer">
          {p.content}
        </a>
      )
    }
    return p.content.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
    ))
  })
}

export function JadeChatWidget() {
  const pathname = usePathname() ?? ''
  const isAdmin  = pathname.startsWith('/admin')

  const [isOpen,       setIsOpen]       = useState(false)
  const [isMinimized,  setIsMinimized]  = useState(false)
  const [messages,     setMessages]     = useState<Message[]>([])
  const [input,        setInput]        = useState('')
  const [isLoading,    setIsLoading]    = useState(false)
  const [showStarters, setShowStarters] = useState(true)
  const [typingPhrase, setTypingPhrase] = useState(TYPING_PHRASES[0])
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [hasGreeted,   setHasGreeted]   = useState(false)
  const [hasMounted,   setHasMounted]   = useState(false)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const historyRef      = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const typingInterval  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setHasMounted(true) }, [])

  // Rotate typing phrase
  useEffect(() => {
    if (isLoading) {
      let i = 0
      typingInterval.current = setInterval(() => {
        i = (i + 1) % TYPING_PHRASES.length
        setTypingPhrase(TYPING_PHRASES[i])
      }, 1800)
    } else {
      if (typingInterval.current) clearInterval(typingInterval.current)
    }
    return () => { if (typingInterval.current) clearInterval(typingInterval.current) }
  }, [isLoading])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    setIsMinimized(false)
    setUnreadCount(0)
    if (!hasGreeted) {
      setHasGreeted(true)
      setTimeout(() => {
        setMessages([{
          id:        'welcome',
          role:      'assistant',
          content:   `Hi there! 👋 I'm **Jade**, your personal travel consultant at Walz Travels.\n\nWhether you're dreaming of a beach escape, planning a business trip, or need visa support — I've got you. What are you planning?`,
          timestamp: new Date(),
        }])
        setShowStarters(true)
      }, 300)
    }
  }, [hasGreeted])

  const sendMessage = useCallback(async (text?: string) => {
    const userMessage = (text ?? input).trim()
    if (!userMessage || isLoading) return

    setInput('')
    setShowStarters(false)

    // Extract name if introduced
    const nameMatch = userMessage.match(/(?:i'm|i am|my name is|call me)\s+([A-Z][a-z]+)/i)
    if (nameMatch) setCustomerName(nameMatch[1])

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   userMessage,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const res = await fetch('/api/jade/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:             userMessage,
          conversationHistory: historyRef.current,
          customerName,
          pageContext:         pathname.replace(/^\//, '') || 'home',
        }),
      })

      const data = await res.json()
      const reply: string = data.reply ?? "I'm having a brief issue — WhatsApp us on +44 7398 753797 for instant help!"

      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const,      content: userMessage },
        { role: 'assistant' as const, content: reply },
      ].slice(-20)

      const assistantMsg: Message = {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   reply,
        timestamp: new Date(),
        intent:    data.intent,
      }
      setMessages(prev => [...prev, assistantMsg])

      if (isMinimized || !isOpen) {
        setUnreadCount(prev => prev + 1)
      }
    } catch {
      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   "I'm having a brief technical issue. For instant help, WhatsApp us on **+44 7398 753797** — we respond within minutes! ✈",
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, customerName, pathname, isMinimized, isOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const handleReset = () => {
    setMessages([])
    historyRef.current = []
    setShowStarters(true)
    setHasGreeted(false)
    setCustomerName('')
    handleOpen()
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // Don't render on admin pages or before hydration
  if (!hasMounted || isAdmin) return null

  return (
    <>
      {/* ── FLOATING LAUNCHER ───────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          aria-label="Chat with Jade"
          className="fixed bottom-6 right-6 z-[9999] group"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-[#C9A84C] animate-ping opacity-30 group-hover:opacity-0" />

          {/* Avatar button */}
          <div className="relative w-16 h-16 rounded-full bg-[#0B1F3A] border-2 border-[#C9A84C]
            shadow-[0_8px_30px_rgba(11,31,58,0.5)] hover:scale-110 active:scale-95
            transition-all duration-200 overflow-hidden">
            <Image
              src="/jade-avatar.jpg"
              alt="Chat with Jade"
              fill
              className="object-cover rounded-full"
              sizes="64px"
              priority
            />
          </div>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white
              text-[10px] font-bold rounded-full flex items-center justify-center z-10 shadow">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}

          {/* Tooltip */}
          <span className="absolute bottom-full right-0 mb-3 whitespace-nowrap
            bg-[#0B1F3A] text-white text-xs font-medium px-3 py-1.5 rounded-lg
            opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg">
            Chat with Jade ✈
          </span>
        </button>
      )}

      {/* ── CHAT WINDOW ─────────────────────────────────────── */}
      {isOpen && (
        <div className={[
          'fixed right-5 z-[9999] flex flex-col',
          'bg-white rounded-2xl overflow-hidden',
          'shadow-[0_25px_80px_rgba(11,31,58,0.25)] border border-gray-100',
          'transition-all duration-300 ease-out',
          isMinimized ? 'bottom-5 w-80 h-16' : 'bottom-5 w-[380px] h-[600px] max-h-[calc(100vh-80px)]',
          'max-sm:w-[calc(100vw-16px)] max-sm:right-2 max-sm:left-2',
        ].join(' ')}>

          {/* ── HEADER ───────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0B1F3A] flex-shrink-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#C9A84C]">
              <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" sizes="40px" />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0B1F3A]" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-none">Jade</p>
              <p className="text-[#C9A84C] text-xs mt-0.5">
                {isLoading ? 'Typing…' : 'Walz Travels · Online now'}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <a href="https://wa.me/447398753797?text=Hi%20Jade%2C%20I%20need%20help%20with%20my%20travel%20plans"
                target="_blank" rel="noopener noreferrer" title="WhatsApp"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-[#25D366] hover:bg-white/10 transition-all">
                <Phone className="w-3.5 h-3.5" />
              </a>
              <a href="mailto:contact@walztravels.com" title="Email"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-[#C9A84C] hover:bg-white/10 transition-all">
                <Mail className="w-3.5 h-3.5" />
              </a>
              <button onClick={handleReset} title="New conversation"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsMinimized(p => !p)} title={isMinimized ? 'Expand' : 'Minimize'}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setIsOpen(false); setUnreadCount(0) }} title="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── BODY ─────────────────────────────────────────── */}
          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth
                bg-gradient-to-b from-[#F5F0E8]/30 to-white">

                {messages.map(msg => (
                  <div key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-[#C9A84C]/30">
                        <Image src="/jade-avatar.jpg" alt="Jade" width={28} height={28} className="object-cover" />
                      </div>
                    )}

                    <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#0B1F3A] text-white rounded-tr-sm'
                          : 'bg-white text-[#0B1F3A] rounded-tl-sm border border-gray-100 shadow-sm'
                      }`}>
                        {msg.role === 'assistant' ? parseMarkdown(msg.content) : msg.content}
                      </div>
                      <span className="text-[10px] text-gray-400 px-1">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isLoading && (
                  <div className="flex gap-2.5 items-end">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-[#C9A84C]/30">
                      <Image src="/jade-avatar.jpg" alt="Jade" width={28} height={28} className="object-cover" />
                    </div>
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="text-xs text-gray-400">{typingPhrase}</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick starters */}
              {showStarters && messages.length > 0 && (
                <div className="px-4 pb-2 pt-1 flex flex-wrap gap-1.5 bg-white border-t border-gray-50">
                  {QUICK_STARTERS.map(s => (
                    <button key={s} onClick={() => void sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-[#C9A84C]/40
                        text-[#0B1F3A] hover:bg-[#C9A84C]/10 hover:border-[#C9A84C]
                        transition-all duration-150 font-medium">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-3 pb-3 pt-2 bg-white border-t border-gray-100 flex-shrink-0">
                <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-2
                  border border-gray-200 focus-within:border-[#C9A84C] transition-colors">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Jade anything about travel…"
                    rows={1}
                    disabled={isLoading}
                    className="flex-1 bg-transparent text-sm text-[#0B1F3A] placeholder-gray-400
                      resize-none outline-none min-h-[20px] max-h-[80px]
                      disabled:opacity-50 leading-relaxed"
                    onInput={e => {
                      const t = e.currentTarget
                      t.style.height = 'auto'
                      t.style.height = `${Math.min(t.scrollHeight, 80)}px`
                    }}
                  />
                  <button
                    onClick={() => void sendMessage()}
                    disabled={isLoading || !input.trim()}
                    className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center
                      disabled:opacity-40 hover:bg-[#162d52] active:scale-95
                      transition-all duration-150 flex-shrink-0">
                    {isLoading
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Send className="w-4 h-4 text-[#C9A84C]" />
                    }
                  </button>
                </div>
                <p className="text-center text-[10px] text-gray-300 mt-2">
                  Powered by Jade AI · Walz Travels
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
