'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  X, Send, Minimize2, Maximize2,
  Phone, Mail, Loader2, RotateCcw, UserCheck,
} from 'lucide-react'
import type { TravelDNA } from '@/app/api/jade/chatwoot/route'

// ─── Session persistence ───────────────────────────────────────────────────────
const SESSION_KEY      = 'walz_jade_session'
const SESSION_TTL      = 2 * 60 * 60 * 1000   // 2 hours
const IDLE_WARNING_MS  = 15 * 60 * 1000        // 15 minutes
const IDLE_CLOSE_MS    = 60 * 60 * 1000        // 60 minutes

function generateSessionId() {
  return `jade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface PersistedSession {
  sessionId:      string
  conversationId: number | null
  messages:       Message[]
  isHandedOff:    boolean
  agentName:      string | null
  customerName:   string
  lastActiveAt:   number
  userProfile:    Record<string, unknown>
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:              string
  role:            'user' | 'assistant' | 'system'
  content:         string
  timestamp:       Date
  isSystemMessage?: boolean
  isIdleCheckIn?:  boolean
  intent?:         string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mergeProfile(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && Array.isArray(merged[key])) {
      merged[key] = [...new Set([...(merged[key] as unknown[]), ...value])]
    } else {
      merged[key] = value
    }
  }
  return merged
}

interface HandoverInfo {
  needed:  boolean
  reason:  string
  urgency: 'low' | 'medium' | 'high'
  routeTo: 'visa' | 'reservations' | 'admin'
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

const DNA_BADGE_LABELS: Partial<Record<keyof TravelDNA, string>> = {
  budget:  'Budget',
  party:   'Travelling as',
  urgency: 'Timing',
}
void DNA_BADGE_LABELS

function parseMarkdown(text: string) {
  const parts: Array<{ type: 'text' | 'bold' | 'link'; content: string; href?: string }> = []
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    if (match[1]) parts.push({ type: 'bold', content: match[1] })
    else if (match[2] && match[3]) parts.push({ type: 'link', content: match[2], href: match[3] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) })

  return parts.map((p, i) => {
    if (p.type === 'bold') return <strong key={i} className="font-semibold text-[#0B1F3A]">{p.content}</strong>
    if (p.type === 'link') return (
      <a key={i} href={p.href} className="text-[#C9A84C] underline hover:no-underline font-medium"
        target={p.href?.startsWith('http') ? '_blank' : '_self'} rel="noopener noreferrer">
        {p.content}
      </a>
    )
    return p.content.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
    ))
  })
}

function DNABadge({ dna }: { dna: TravelDNA }) {
  const tags: string[] = []
  if (dna.style.length)        tags.push(dna.style[0])
  if (dna.budget)               tags.push(dna.budget)
  if (dna.party)                tags.push(dna.party)
  if (dna.destinations.length)  tags.push(dna.destinations[0])
  if (!tags.length) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-4 pt-2 pb-1">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Travel DNA:</span>
      {tags.slice(0, 4).map(tag => (
        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#92400E] font-medium border border-[#C9A84C]/20">
          {tag}
        </span>
      ))}
    </div>
  )
}

function IntentCTAs({ intent, onClose }: { intent: string; onClose: () => void }) {
  const pill = 'text-xs font-semibold bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] rounded-full px-3 py-1.5 hover:bg-[#C9A84C]/20 transition-colors cursor-pointer'
  const go = (url: string) => { window.location.href = url; onClose() }

  if (intent === 'visa') return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button onClick={() => go('/visa')} className={pill}>📋 Start Visa Application →</button>
      <button onClick={() => go('/visa#rates')} className={pill}>💰 View Visa Fees</button>
    </div>
  )
  if (intent === 'flights') return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button onClick={() => go('/flights')} className={pill}>✈ Search Flights →</button>
      <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer" className={pill}>📞 Speak to an Agent</a>
    </div>
  )
  if (intent === 'hotels') return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button onClick={() => go('/hotels')} className={pill}>🏨 Browse Hotels →</button>
    </div>
  )
  if (intent === 'experiences') return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button onClick={() => go('/tours')} className={pill}>🌍 View Tours →</button>
      <button onClick={() => go('/activities')} className={pill}>🎭 Experiences</button>
    </div>
  )
  return null
}

function HandoverCard({ handover }: { handover: HandoverInfo }) {
  const urgencyColor = handover.urgency === 'high' ? '#EF4444' : handover.urgency === 'medium' ? '#F59E0B' : '#10B981'
  const teamLabel    = handover.routeTo === 'visa' ? 'Visa Team' : handover.routeTo === 'reservations' ? 'Reservations Team' : 'Walz Travels Team'

  return (
    <div className="mx-4 my-2 rounded-xl overflow-hidden border border-[#C9A84C]/30">
      <div className="bg-[#0B1F3A] px-4 py-2.5 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-[#C9A84C]" />
        <span className="text-xs font-bold text-[#C9A84C]">Connecting you with our {teamLabel}</span>
        <div className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: urgencyColor }} />
      </div>
      <div className="bg-[#F7F4EF] px-4 py-3">
        <p className="text-xs text-[#0B1F3A]">{handover.reason}</p>
        <div className="flex items-center gap-3 mt-2">
          <a href="https://wa.me/447398753797"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#25D366] hover:underline">
            <Phone className="w-3 h-3" /> WhatsApp now
          </a>
          <a href="mailto:contact@walztravels.com"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#C9A84C] hover:underline">
            <Mail className="w-3 h-3" /> Email us
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Main widget ───────────────────────────────────────────────────────────────
export function JadeChatWidget() {
  const pathname = usePathname() ?? ''
  const isAdmin  = pathname.startsWith('/admin')
  const isForm   = ['/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/'].some(p => pathname.startsWith(p))

  const [isOpen,         setIsOpen]         = useState(false)
  const [isMinimized,    setIsMinimized]     = useState(false)
  const [messages,       setMessages]        = useState<Message[]>([])
  const [input,          setInput]           = useState('')
  const [isLoading,      setIsLoading]       = useState(false)
  const [showStarters,   setShowStarters]    = useState(true)
  const [typingPhrase,   setTypingPhrase]    = useState(TYPING_PHRASES[0])
  const [unreadCount,    setUnreadCount]     = useState(0)
  const [customerName,   setCustomerName]    = useState('')
  const [hasGreeted,     setHasGreeted]      = useState(false)
  const [hasMounted,     setHasMounted]      = useState(false)
  const [dna,            setDna]             = useState<TravelDNA | null>(null)
  const [handover,       setHandover]        = useState<HandoverInfo | null>(null)
  const [isHandedOff,    setIsHandedOff]     = useState(false)
  const [agentName,      setAgentName]       = useState<string | null>(null)
  // Session — managed as state so persistence effects react to changes
  const [sessionId,      setSessionId]       = useState<string>('')
  const [conversationId, setConversationId]  = useState<number | null>(null)
  const [isReturning,    setIsReturning]     = useState(false)
  const [userProfile,    setUserProfile]     = useState<Record<string, unknown>>({})
  const [quickReplies,   setQuickReplies]    = useState<Array<{ label: string; value: string; type: 'message' | 'link' }>>([])


  const messagesEndRef      = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLTextAreaElement>(null)
  const historyRef          = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const typingInterval      = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActivityRef     = useRef<number>(Date.now())
  const idleCheckSentRef    = useRef(false)
  const hasLoadedProfileRef = useRef(false)

  // ── Mount: hydrate or create session ──────────────────────────────────────
  useEffect(() => {
    setHasMounted(true)
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const session: PersistedSession = JSON.parse(raw)
        const age = Date.now() - session.lastActiveAt

        if (age < SESSION_TTL) {
          // Restore messages with correct Date objects
          const restored = session.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
          setSessionId(session.sessionId)
          setConversationId(session.conversationId)
          setMessages(restored)
          setIsHandedOff(session.isHandedOff)
          setAgentName(session.agentName)
          setCustomerName(session.customerName ?? '')
          setUserProfile(session.userProfile ?? {})
          historyRef.current = restored
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
            .slice(-20)
          setIsReturning(true)
          setHasGreeted(true)  // don't re-run welcome sequence
        } else {
          // Expired — clear and start fresh
          localStorage.removeItem(SESSION_KEY)
          setSessionId(generateSessionId())
        }
      } else {
        setSessionId(generateSessionId())
      }
    } catch {
      setSessionId(generateSessionId())
    }
  }, [])

  // ── Persist session whenever key state changes ─────────────────────────────
  useEffect(() => {
    if (!sessionId || !hasMounted) return
    try {
      const session: PersistedSession = {
        sessionId,
        conversationId,
        messages: messages.slice(-30),
        isHandedOff,
        agentName,
        customerName,
        lastActiveAt: Date.now(),
        userProfile,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {}
  }, [messages, isHandedOff, conversationId, agentName, customerName, sessionId, hasMounted, userProfile])

  // ── Load saved profile from Redis when sessionId is available ──────────────
  useEffect(() => {
    if (!sessionId || !hasMounted || hasLoadedProfileRef.current) return
    hasLoadedProfileRef.current = true
    fetch(`/api/jade/memory?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then((data: { profile?: Record<string, unknown> }) => {
        if (data.profile && Object.keys(data.profile).length > 0) {
          setUserProfile(prev => mergeProfile(prev, data.profile!))
        }
      })
      .catch(() => {})
  }, [sessionId, hasMounted])

  // ── Idle detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle >= IDLE_CLOSE_MS) {
        setIsMinimized(true)
      } else if (idle >= IDLE_WARNING_MS && !isHandedOff && !idleCheckSentRef.current) {
        idleCheckSentRef.current = true
        setMessages(prev => [...prev, {
          id:            String(Date.now()),
          role:          'assistant',
          content:       'Still there? 😊 No rush — I\'m here whenever you\'re ready.',
          timestamp:     new Date(),
          isIdleCheckIn: true,
        }])
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [isOpen, isHandedOff])

  // ── Poll for agent messages when handed off ────────────────────────────────
  // Agent replies are sent via Chatwoot (admin panel) and buffered in JadeSession
  // by the Chatwoot webhook. We poll every 3 s to deliver them to the visitor.
  useEffect(() => {
    if (!isHandedOff || !conversationId) return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/jade/poll?conversationId=${conversationId}`)
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          messages:    Array<{ content: string; agentName: string; timestamp: string }>
          agentActive: boolean
        }
        if (data.messages.length > 0) {
          setMessages(prev => [
            ...prev,
            ...data.messages.map(m => ({
              id:        `agent-${m.timestamp}`,
              role:      'assistant' as const,
              content:   m.content,
              timestamp: new Date(m.timestamp),
            })),
          ])
          setUnreadCount(prev => prev + data.messages.length)
          const name = data.messages.find(m => m.agentName && m.agentName !== 'Agent')?.agentName
          if (name) setAgentName(name)
        }
        // Jade resumed → unlock widget
        if (!data.agentActive && !cancelled) {
          setIsHandedOff(false)
          setAgentName(null)
        }
      } catch {}
    }

    void poll()
    const interval = setInterval(() => { void poll() }, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [isHandedOff, conversationId])

  // ── Typing indicator rotation ──────────────────────────────────────────────
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, handover])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  // ── Open handler ───────────────────────────────────────────────────────────
  const handleOpen = useCallback((context?: { service?: string; detail?: string; page?: string; message?: string }) => {
    setIsOpen(true); setIsMinimized(false); setUnreadCount(0)
    lastActivityRef.current = Date.now()
    idleCheckSentRef.current = false

    if (hasGreeted) return  // already greeted (including restored sessions)

    setHasGreeted(true)
    const isFlight = context?.service === 'Flight' || context?.page?.startsWith('/flights')

    if (isReturning) {
      // Returning within TTL — add appropriate context message
      setTimeout(() => {
        const contextMsg: Message = isHandedOff
          ? {
              id:              `return-${Date.now()}`,
              role:            'system',
              content:         `Welcome back. Your conversation with ${agentName ?? 'a Walz agent'} is still open. They will reply as soon as they are available. Office hours: 8am–10pm GMT.`,
              timestamp:       new Date(),
              isSystemMessage: true,
            }
          : (() => {
              const pName       = typeof userProfile.name === 'string' && userProfile.name ? ` ${userProfile.name}` : ''
              const pdests      = Array.isArray(userProfile.destinations) ? userProfile.destinations as string[] : []
              const lastTopic   = pdests[0] ?? null
              return {
                id:              `return-${Date.now()}`,
                role:            'system' as const,
                content:         lastTopic
                  ? `Welcome back${pName}! Last time we were looking at **${lastTopic}** — still on your mind?`
                  : `Welcome back${pName}! Here is your previous conversation with Jade.`,
                timestamp:       new Date(),
                isSystemMessage: true,
              }
            })()

        setMessages(prev => {
          // Prepend the context note before the restored messages if needed
          const alreadyHasNote = prev.some(m => m.id.startsWith('return-'))
          return alreadyHasNote ? prev : [contextMsg, ...prev]
        })
        setShowStarters(false)
      }, 300)
      return
    }

    // Fresh session welcome
    setTimeout(() => {
      const msgs: Message[] = [{
        id:        'welcome',
        role:      'assistant',
        content:   `Hi there! 👋 I'm **Jade**, your personal travel consultant at Walz Travels.\n\nWhether you're dreaming of a beach escape, planning a business trip, or need visa support — I've got you. What are you planning?`,
        timestamp: new Date(),
      }]

      if (isFlight) {
        msgs.push({
          id:        'flight-context',
          role:      'assistant',
          content:   `✈️ I can see you're coming from our **Flight Concierge**. I'm ready to help you search 900+ airlines, compare fares, check visa requirements, and find the best route for your budget. Where would you like to fly?`,
          timestamp: new Date(),
        })
      }

      setMessages(msgs)
      setShowStarters(true)
    }, 300)
  }, [hasGreeted, isReturning, isHandedOff, agentName])

  // ── Event listener for jade:open ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const ctx = (e as CustomEvent<{ service?: string; detail?: string; page?: string; message?: string }>).detail
      handleOpen(ctx)
    }
    window.addEventListener('jade:open', handler)
    return () => window.removeEventListener('jade:open', handler)
  }, [handleOpen])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const userMessage = (text ?? input).trim()
    if (!userMessage || isLoading || isHandedOff) return

    lastActivityRef.current = Date.now()
    idleCheckSentRef.current = false

    setInput('')
    setShowStarters(false)
    setHandover(null)
    setQuickReplies([])

    const nameMatch = userMessage.match(/(?:i'm|i am|my name is|call me)\s+([A-Z][a-z]+)/i)
    if (nameMatch) setCustomerName(nameMatch[1])

    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: 'user', content: userMessage, timestamp: new Date(),
    }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/jade/chatwoot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:             userMessage,
          conversationHistory: historyRef.current,
          sessionId,
          conversationId,
          customerName,
          pageContext:         pathname.replace(/^\//, '') || 'home',
          isReturning,
          userProfile:         Object.keys(userProfile).length > 0 ? userProfile : undefined,
        }),
      })

      const data = await res.json()

      if (data.conversationId) {
        setConversationId(Number(data.conversationId))
      }

      if (data.dna)      setDna(data.dna)
      if (data.handover) setHandover(data.handover as HandoverInfo)
      if (Array.isArray(data.quickReplies)) {
        setQuickReplies(data.quickReplies as Array<{ label: string; value: string; type: 'message' | 'link' }>)
      } else {
        setQuickReplies([])
      }

      // Save extracted profile — update state and persist to Redis
      if (data.extractedProfile) {
        const ep = data.extractedProfile as Record<string, unknown>
        setUserProfile(prev => mergeProfile(prev, ep))
        void fetch('/api/jade/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            profileUpdates: {
              ...ep,
              ...(data.conversationId ? { chatwootConvId: data.conversationId } : {}),
            },
          }),
        }).catch(() => {})
      }

      if (!res.ok && !data.reply && !data.handedOff) {
        throw new Error(`API ${res.status}`)
      }

      // Human agent took over — lock Jade and show system message
      if (data.handedOff) {
        const name = (data.agentName as string | null) ?? 'a Walz travel expert'
        if (!isHandedOff) {
          setIsHandedOff(true)
          setAgentName(name)
          setMessages(prev => [...prev, {
            id:              (Date.now() + 1).toString(),
            role:            'system',
            content:         `👤 You're now chatting with ${name}. Jade has stepped aside — your agent will respond shortly.`,
            timestamp:       new Date(),
            isSystemMessage: true,
          }])
        }
        if (isMinimized || !isOpen) setUnreadCount(prev => prev + 1)
        return
      }

      const reply: string = data.reply ?? "I'm just a moment away — if you need immediate help, WhatsApp us on **+44 7398 753797** ✈"

      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const,      content: userMessage },
        { role: 'assistant' as const, content: reply },
      ].slice(-20)

      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   reply,
        timestamp: new Date(),
        intent:    (data.intent as string | undefined) ?? undefined,
      }])

      if (isMinimized || !isOpen) setUnreadCount(prev => prev + 1)
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
  }, [input, isLoading, isHandedOff, sessionId, conversationId, customerName, pathname, isMinimized, isOpen, isReturning, userProfile])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  const updateActivity = () => {
    lastActivityRef.current = Date.now()
    idleCheckSentRef.current = false
  }

  const handleReset = () => {
    setMessages([]); historyRef.current = []; setShowStarters(true)
    setHasGreeted(false); setCustomerName(''); setDna(null); setHandover(null)
    setIsHandedOff(false); setAgentName(null); setIsReturning(false)
    setConversationId(null); setSessionId(generateSessionId()); setUserProfile({})
    idleCheckSentRef.current = false; hasLoadedProfileRef.current = false
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    handleOpen()
  }

  const formatTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  if (!hasMounted || isAdmin || isForm) return null

  const lastAiMsgIdx = messages.reduce(
    (last, m, i) => (m.role === 'assistant' && !m.isSystemMessage ? i : last),
    -1,
  )

  return (
    <>
      {/* Launcher */}
      {!isOpen && (
        <button onClick={() => handleOpen()} aria-label="Chat with Jade"
          className="fixed bottom-6 right-6 z-[9999] group"
          style={{ background: 'none', border: 'none', padding: 0 }}>
          <span className="absolute inset-0 rounded-full bg-[#C9A84C] animate-ping opacity-30 group-hover:opacity-0" />
          <div className="relative w-16 h-16 rounded-full bg-[#0B1F3A] border-2 border-[#C9A84C]
            shadow-[0_8px_30px_rgba(11,31,58,0.5)] hover:scale-110 active:scale-95
            transition-all duration-200 overflow-hidden">
            <Image src="/jade-avatar.jpg" alt="Chat with Jade" fill className="object-cover rounded-full" sizes="64px" priority />
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white
              text-[10px] font-bold rounded-full flex items-center justify-center z-10 shadow">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="absolute bottom-full right-0 mb-3 whitespace-nowrap
            bg-[#0B1F3A] text-white text-xs font-medium px-3 py-1.5 rounded-lg
            opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg">
            Chat with Jade ✈
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className={[
          'fixed right-5 z-[9999] flex flex-col bg-white rounded-2xl overflow-hidden',
          'shadow-[0_25px_80px_rgba(11,31,58,0.25)] border border-gray-100',
          'transition-all duration-300 ease-out',
          isMinimized ? 'bottom-5 w-80 h-16' : 'bottom-5 w-[380px] h-[600px] max-h-[calc(100vh-80px)]',
          'max-sm:w-[calc(100vw-16px)] max-sm:right-2 max-sm:left-2',
        ].join(' ')}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0B1F3A] flex-shrink-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#C9A84C]">
              <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" sizes="40px" />
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B1F3A] ${isHandedOff ? 'bg-amber-400' : 'bg-green-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-none">
                {isHandedOff ? (agentName ?? 'Walz Agent') : 'Jade'}
              </p>
              <p className="text-[#C9A84C] text-xs mt-0.5">
                {isHandedOff ? 'Live agent · Connected' : isLoading ? 'Typing…' : 'Walz Travels · Online now'}
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

          {/* Travel DNA badge */}
          {!isMinimized && dna && dna.msgCount >= 2 && <DNABadge dna={dna} />}

          {/* Body */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth
                bg-gradient-to-b from-[#F5F0E8]/30 to-white">
                {messages.map((msg, i) => {
                  // System / handoff notification — centred pill, not a chat bubble
                  if (msg.isSystemMessage) return (
                    <div key={msg.id} className="flex justify-center my-3">
                      <div className="flex items-center gap-1.5 text-xs text-[#92400E] py-1.5 px-4
                        bg-[#C9A84C]/15 border border-[#C9A84C]/30 rounded-full max-w-[90%] text-center">
                        <UserCheck className="w-3 h-3 flex-shrink-0 text-[#C9A84C]" />
                        <span>{parseMarkdown(msg.content)}</span>
                      </div>
                    </div>
                  )

                  return (
                    <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
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
                        {/* Intent CTAs — shown only below the last Jade message */}
                        {msg.role === 'assistant' && i === lastAiMsgIdx &&
                          msg.intent && msg.intent !== 'general' && !isLoading && (
                          <IntentCTAs
                            intent={msg.intent}
                            onClose={() => { setIsOpen(false); setUnreadCount(0) }}
                          />
                        )}
                        {/* Quick replies — flow-specific action buttons */}
                        {msg.role === 'assistant' && i === lastAiMsgIdx &&
                          quickReplies.length > 0 && !isLoading && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {quickReplies.map(qr => qr.type === 'link' ? (
                              <a
                                key={qr.label}
                                href={qr.value}
                                target="_self"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 rounded-full border border-[#C9A84C]
                                  bg-[#C9A84C]/10 text-[#0B1F3A] hover:bg-[#C9A84C]/20
                                  transition-all duration-150 font-medium no-underline"
                                onClick={() => setQuickReplies([])}
                              >
                                {qr.label}
                              </a>
                            ) : (
                              <button
                                key={qr.label}
                                onClick={() => void sendMessage(qr.value)}
                                className="text-xs px-3 py-1.5 rounded-full border border-[#C9A84C]
                                  bg-[#C9A84C]/10 text-[#0B1F3A] hover:bg-[#C9A84C]/20
                                  transition-all duration-150 font-medium"
                              >
                                {qr.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Handover card (Jade-triggered escalation) */}
                {handover && <HandoverCard handover={handover} />}

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
              {showStarters && messages.length > 0 && !handover && !isHandedOff && (
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

              {/* Input area */}
              {!handover && (
                <div className="px-3 pb-3 pt-2 bg-white border-t border-gray-100 flex-shrink-0">
                  {isHandedOff ? (
                    /* Handed-off: locked input + "Chat with Jade again" */
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5
                        border border-gray-200 opacity-60 cursor-not-allowed">
                        <textarea
                          disabled
                          placeholder="Your agent will reply shortly…"
                          rows={1}
                          className="flex-1 bg-transparent text-sm text-gray-400 placeholder-gray-400
                            resize-none outline-none min-h-[20px] cursor-not-allowed"
                        />
                        <div className="w-8 h-8 rounded-lg bg-gray-300 flex items-center justify-center flex-shrink-0">
                          <Send className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-[10px] text-gray-400">
                            {agentName ?? 'Your agent'} is live
                          </span>
                        </div>
                        <button onClick={handleReset}
                          className="text-[10px] text-[#C9A84C] hover:underline font-medium">
                          Chat with Jade again
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal Jade input */
                    <>
                      <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-2
                        border border-gray-200 focus-within:border-[#C9A84C] transition-colors">
                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onInput={e => {
                            updateActivity()
                            const t = e.currentTarget
                            t.style.height = 'auto'
                            t.style.height = `${Math.min(t.scrollHeight, 80)}px`
                          }}
                          onFocus={updateActivity}
                          placeholder="Ask Jade anything about travel…"
                          rows={1}
                          disabled={isLoading}
                          className="flex-1 bg-transparent text-sm text-[#0B1F3A] placeholder-gray-400
                            resize-none outline-none min-h-[20px] max-h-[80px] disabled:opacity-50 leading-relaxed"
                        />
                        <button
                          onClick={() => void sendMessage()}
                          disabled={isLoading || !input.trim()}
                          className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center
                            disabled:opacity-40 hover:bg-[#162d52] active:scale-95 transition-all flex-shrink-0">
                          {isLoading
                            ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                            : <Send className="w-4 h-4 text-[#C9A84C]" />
                          }
                        </button>
                      </div>
                      <p className="text-center text-[10px] text-gray-300 mt-2">
                        Powered by Jade AI · Walz Travels
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Post-handover contact options (Jade-triggered escalation) */}
              {handover && (
                <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 flex-shrink-0 space-y-2">
                  <a href="https://wa.me/447398753797?text=Hi%2C%20Jade%20connected%20me%20for%20travel%20help"
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                      bg-[#25D366] text-white text-xs font-bold hover:bg-[#20ba5a] transition-colors">
                    <Phone className="w-3.5 h-3.5" /> WhatsApp us now
                  </a>
                  <a href="mailto:contact@walztravels.com"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                      bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold hover:bg-[#162d52] transition-colors">
                    <Mail className="w-3.5 h-3.5" /> contact@walztravels.com
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
