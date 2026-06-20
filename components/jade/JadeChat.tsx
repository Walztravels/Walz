'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  X, Send, Minimize2, Maximize2,
  Phone, Mail, Loader2, RotateCcw, UserCheck, Shield, Globe, Mic, MicOff,
} from 'lucide-react'
import type { TravelDNA } from '@/app/api/jade/chatwoot/route'

// ─── Browser types for Web Speech API ─────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  timestamp: Date
  isAgent?:  boolean
}

interface HandoverInfo {
  needed:  boolean
  reason:  string
  urgency: 'low' | 'medium' | 'high'
  routeTo: 'visa' | 'reservations' | 'admin'
}

type Mood = 'neutral' | 'excited' | 'urgent' | 'concerned' | 'warm'

// ─── Constants ─────────────────────────────────────────────────────────────────

const QUICK_STARTERS = [
  '✈ Book a flight',
  '🏨 Find hotels',
  '🌍 Plan a holiday',
  '📋 Visa help',
  '🚗 Airport transfer',
]

const MOOD_COLORS: Record<Mood, string> = {
  neutral:   '#0B1F3A',
  excited:   '#0B2A4A',
  concerned: '#1A1F3A',
  urgent:    '#2A1A1A',
  warm:      '#0B2520',
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'zh', label: '中文' },
]

const LANG_SPEECH_CODES: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR',
  ar: 'ar-SA', yo: 'yo-NG', zh: 'zh-CN',
}

// ─── localStorage helpers ──────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch {}
}
function lsRemove(key: string) {
  try { localStorage.removeItem(key) } catch {}
}

// ─── Language / mood / suggestions helpers ─────────────────────────────────────

function detectLanguage(text: string): string {
  if (/[؀-ۿ]/.test(text)) return 'ar'
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/\b(je|vous|nous|merci|bonjour|c'est|je veux|je voudrais)\b/i.test(text)) return 'fr'
  if (/\b(hola|gracias|quiero|viaje|necesito|España|vuelo)\b/i.test(text)) return 'es'
  if (/\b(obrigado|quero|viagem|brasil|olá|voo|hotel)\b/i.test(text)) return 'pt'
  if (/\b(danke|hallo|ich möchte|reise|flug|guten)\b/i.test(text)) return 'de'
  if (/\b(ẹ jọ|ẹ ku|mo fẹ|yoruba|Lagos|Abuja)\b/i.test(text)) return 'yo'
  return 'en'
}

function detectMood(text: string): Mood {
  const t = text.toLowerCase()
  if (/urgent|asap|emergency|immediately|deadline|hurry|fast/.test(t)) return 'urgent'
  if (/excited|amazing|love|can'?t wait|dream|perfect|fantastic|so happy/.test(t)) return 'excited'
  if (/worried|concerned|problem|issue|trouble|confused|help me/.test(t)) return 'concerned'
  if (/thank|wonderful|great|appreciate|brilliant|awesome/.test(t)) return 'warm'
  return 'neutral'
}

function getSmartSuggestions(reply: string): string[] {
  const t = reply.toLowerCase()
  if (/visa|passport|document|embassy|application/.test(t))
    return ['What documents do I need?', 'How long does it take?', 'What are the fees?']
  if (/flight|airline|fly|airport|economy|business class/.test(t))
    return ['Search flights now', 'Check business class', 'What\'s the cheapest date?']
  if (/hotel|accommodation|stay|resort|suite/.test(t))
    return ['5-star options', 'Does it include breakfast?', 'City centre location?']
  if (/tour|itinerary|visit|sightseeing|trip/.test(t))
    return ['Build my full itinerary', 'Private tours available?', 'Best time to visit?']
  if (/insurance|cover|medical|emergency/.test(t))
    return ['What\'s covered?', 'How much does it cost?', 'Do I need it for a visa?']
  if (/transfer|taxi|car|pickup|arrival/.test(t))
    return ['Book an airport transfer', 'Private car options', 'How far is the airport?']
  return ['Tell me more', 'What\'s the price?', 'How do I book?']
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

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

// ─── Sub-components ────────────────────────────────────────────────────────────

function DNABadge({ dna }: { dna: TravelDNA }) {
  const tags: string[] = []
  if (dna.style.length)       tags.push(dna.style[0])
  if (dna.budget)              tags.push(dna.budget)
  if (dna.party)               tags.push(dna.party)
  if (dna.destinations.length) tags.push(dna.destinations[0])
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

function HandoverCard({ handover }: { handover: HandoverInfo }) {
  const teamLabel = handover.routeTo === 'visa'
    ? 'Visa Team'
    : handover.routeTo === 'reservations'
      ? 'Reservations Team'
      : 'Walz Travels Team'

  if (handover.urgency === 'low') {
    return (
      <div className="mx-4 my-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 flex items-center gap-2">
        <UserCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <p className="text-xs text-gray-500">👤 Our {teamLabel} has been notified and may join shortly.</p>
      </div>
    )
  }

  const urgencyColor = handover.urgency === 'high' ? '#EF4444' : '#F59E0B'
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
          <a href="https://wa.me/447398753797" className="flex items-center gap-1.5 text-xs font-semibold text-[#25D366] hover:underline">
            <Phone className="w-3 h-3" /> WhatsApp now
          </a>
          <a href="mailto:contact@walztravels.com" className="flex items-center gap-1.5 text-xs font-semibold text-[#C9A84C] hover:underline">
            <Mail className="w-3 h-3" /> Email us
          </a>
        </div>
      </div>
    </div>
  )
}

function AgentBanner() {
  return (
    <div className="mx-4 my-2 rounded-xl overflow-hidden border border-blue-200">
      <div className="bg-blue-50 px-4 py-3 flex items-start gap-2">
        <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-800">A Walz consultant is handling your conversation</p>
          <p className="text-xs text-blue-600 mt-0.5">Jade will step back in if they don't respond within 30 minutes.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main widget ───────────────────────────────────────────────────────────────

export function JadeChat() {
  const pathname = usePathname() ?? ''
  const isAdmin  = pathname.startsWith('/admin')

  const [isOpen,        setIsOpen]        = useState(false)
  const [isMinimized,   setIsMinimized]   = useState(false)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [input,         setInput]         = useState('')
  const [isLoading,     setIsLoading]     = useState(false)
  const [showStarters,  setShowStarters]  = useState(true)
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [customerName,  setCustomerName]  = useState('')
  const [hasGreeted,    setHasGreeted]    = useState(false)
  const [hasMounted,    setHasMounted]    = useState(false)
  const [dna,           setDna]           = useState<TravelDNA | null>(null)
  const [handover,      setHandover]      = useState<HandoverInfo | null>(null)
  const [agentActive,   setAgentActive]   = useState(false)

  // New v4 state
  const [mood,          setMood]          = useState<Mood>('neutral')
  const [selectedLang,  setSelectedLang]  = useState('en')
  const [showLangMenu,  setShowLangMenu]  = useState(false)
  const [isListening,   setIsListening]   = useState(false)
  const [suggestions,   setSuggestions]   = useState<string[] | null>(null)
  const [typingMsgId,   setTypingMsgId]   = useState<string | null>(null)
  const [typedChars,    setTypedChars]    = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)
  const historyRef     = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const typeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingFullRef  = useRef('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // ── Mount + restore from localStorage ──────────────────────────────────────
  useEffect(() => {
    setHasMounted(true)
    const stored = lsGet('jade_messages')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>
        const restored = parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
        if (restored.length > 0) {
          setMessages(restored)
          setHasGreeted(true)
          setShowStarters(false)
          historyRef.current = restored
            .filter(m => !m.isAgent)
            .slice(-20)
            .map(m => ({ role: m.role, content: m.content }))
        }
      } catch { /* malformed storage — ignore */ }
    }
  }, [])

  // ── Persist messages to localStorage (when not mid-typewriter) ──────────────
  useEffect(() => {
    if (!typingMsgId && messages.length > 0) {
      lsSet('jade_messages', JSON.stringify(messages.slice(-20)))
    }
  }, [messages, typingMsgId])

  // ── Typewriter engine ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!typingMsgId) return

    const fullText = typingFullRef.current
    if (typedChars >= fullText.length) {
      setTypingMsgId(null)
      // Show smart suggestions after typewriter completes
      setSuggestions(getSmartSuggestions(fullText))
      return
    }

    const char = fullText[typedChars]
    const delay = /[.!?]/.test(char) ? 120 : /[,;:]/.test(char) ? 80 : 35

    typeTimerRef.current = setTimeout(() => {
      setTypedChars(prev => prev + 1)
    }, delay)

    return () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current) }
  }, [typingMsgId, typedChars])

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, handover, typedChars])

  // ── Focus input on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  // ── Open widget ─────────────────────────────────────────────────────────────
  const handleOpen = useCallback(() => {
    setIsOpen(true); setIsMinimized(false); setUnreadCount(0)
    if (!hasGreeted) {
      setHasGreeted(true)
      setTimeout(() => {
        setMessages([{
          id:        'welcome',
          role:      'assistant',
          content:   `Hi there! 👋 I'm **Jade** — your personal travel consultant at Walz Travels.\n\nFlights, hotels, visas, tours — I handle it all. What are you planning?`,
          timestamp: new Date(),
        }])
        setShowStarters(true)
      }, 300)
    }
  }, [hasGreeted])

  // ── jade:open event — also handles prefill from JadePlannerSection ──────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string }>).detail
      handleOpen()
      if (detail?.prefill) {
        setTimeout(() => {
          setInput(detail.prefill!)
          inputRef.current?.focus()
        }, 450)
      }
    }
    window.addEventListener('jade:open', handler)
    return () => window.removeEventListener('jade:open', handler)
  }, [handleOpen])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const userMessage = (text ?? input).trim()
    if (!userMessage || isLoading) return

    // Clear any running typewriter before proceeding
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current)
    setTypingMsgId(null)
    setSuggestions(null)
    setInput('')
    setShowStarters(false)
    setHandover(null)

    // Detect name
    const nameMatch = userMessage.match(/(?:i'm|i am|my name is|call me)\s+([A-Z][a-z]+)/i)
    if (nameMatch) setCustomerName(nameMatch[1])

    // Detect mood and language
    const newMood = detectMood(userMessage)
    setMood(newMood)
    const detectedLang = detectLanguage(userMessage)
    if (detectedLang !== 'en' && selectedLang === 'en') setSelectedLang(detectedLang)
    const clientLanguage = selectedLang !== 'en' ? selectedLang : detectedLang

    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: 'user', content: userMessage, timestamp: new Date(),
    }])
    setIsLoading(true)

    try {
      let sessionId = lsGet('jade_sid') ?? ''
      if (!sessionId) {
        sessionId = `jade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        lsSet('jade_sid', sessionId)
      }
      const storedConvId   = lsGet('jade_conv_id')
      const conversationId = storedConvId ? Number(storedConvId) : null

      const res = await fetch('/api/jade/chatwoot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:             userMessage,
          conversationHistory: historyRef.current,
          sessionId,
          conversationId,
          customerName,
          pageContext:         pathname.replace(/^\//, '') || 'home',
          clientLanguage,
        }),
      })

      const data = await res.json()

      if (data.conversationId) lsSet('jade_conv_id', String(data.conversationId))

      // Agent took over
      if (data.silenced) {
        setAgentActive(true)
        setMessages(prev => [...prev, {
          id:        (Date.now() + 1).toString(),
          role:      'assistant',
          content:   '👤 One of our consultants is now handling your conversation. They\'ll be with you shortly.',
          timestamp: new Date(),
          isAgent:   true,
        }])
        return
      }

      if (data.resumed)  setAgentActive(false)
      if (data.dna)      setDna(data.dna)
      if (data.handover) setHandover(data.handover as HandoverInfo)

      const reply: string = data.reply ?? "I'm having a brief issue — WhatsApp us on +44 7398 753797 for instant help!"

      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const,      content: userMessage },
        { role: 'assistant' as const, content: reply },
      ].slice(-20)

      const msgId = (Date.now() + 1).toString()

      // Add message to list (content will be typed out by the typewriter)
      setMessages(prev => [...prev, {
        id: msgId, role: 'assistant', content: reply, timestamp: new Date(),
      }])

      // Start typewriter
      typingFullRef.current = reply
      setTypedChars(0)
      setTypingMsgId(msgId)

      if (isMinimized || !isOpen) setUnreadCount(prev => prev + 1)
    } catch {
      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   "I'm having a brief technical issue. For instant help, WhatsApp us on **+44 7398 753797** ✈",
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, customerName, pathname, isMinimized, isOpen, selectedLang])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  const handleReset = () => {
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current)
    setMessages([]); historyRef.current = []; setShowStarters(true)
    setHasGreeted(false); setCustomerName(''); setDna(null)
    setHandover(null); setAgentActive(false); setSuggestions(null)
    setTypingMsgId(null); setMood('neutral'); setSelectedLang('en')
    lsRemove('jade_sid'); lsRemove('jade_conv_id'); lsRemove('jade_messages')
    handleOpen()
  }

  // ── Voice input ─────────────────────────────────────────────────────────────
  const startVoice = () => {
    const SR = (typeof window !== 'undefined')
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : null
    if (!SR) return

    const recognition = new SR()
    recognition.continuous     = false
    recognition.interimResults = false
    recognition.lang           = LANG_SPEECH_CODES[selectedLang] ?? 'en-US'
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(transcript)
      setIsListening(false)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend   = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const formatTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const headerBg = MOOD_COLORS[mood]

  if (!hasMounted || isAdmin) return null

  return (
    <>
      {/* Launcher bubble */}
      {!isOpen && (
        <button onClick={handleOpen} aria-label="Chat with Jade"
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

          {/* Header — mood ring colour */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 transition-colors duration-700"
            style={{ backgroundColor: headerBg }}>
            <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[#C9A84C]">
              <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" sizes="40px" />
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B1F3A] ${
                agentActive ? 'bg-blue-400' : 'bg-green-400'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-none">Jade</p>
              <p className={`text-xs mt-0.5 ${agentActive ? 'text-blue-300' : 'text-[#C9A84C]'}`}>
                {isLoading || typingMsgId
                  ? 'Typing…'
                  : agentActive
                    ? 'Agent is handling · Jade on standby'
                    : 'Walz Travels · Online now'
                }
              </p>
            </div>

            {/* Language picker */}
            <div className="relative">
              <button onClick={() => setShowLangMenu(p => !p)} title="Change language"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-[#C9A84C] hover:bg-white/10 transition-all">
                <Globe className="w-3.5 h-3.5" />
              </button>
              {showLangMenu && (
                <div className="absolute right-0 top-10 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[140px]">
                  {LANGUAGES.map(lang => (
                    <button key={lang.code}
                      onClick={() => { setSelectedLang(lang.code); setShowLangMenu(false) }}
                      className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${
                        selectedLang === lang.code ? 'text-[#C9A84C]' : 'text-[#0B1F3A]'
                      }`}>
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <a href="https://wa.me/447398753797?text=Hi%20Jade%2C%20I%20need%20help%20with%20my%20travel%20plans"
              target="_blank" rel="noopener noreferrer" title="WhatsApp"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-[#25D366] hover:bg-white/10 transition-all">
              <Phone className="w-3.5 h-3.5" />
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

          {/* Travel DNA badge */}
          {!isMinimized && dna && dna.msgCount >= 2 && <DNABadge dna={dna} />}

          {/* Body */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth
                bg-gradient-to-b from-[#F5F0E8]/30 to-white"
                onClick={() => setShowLangMenu(false)}>

                {/* Messages */}
                {messages.map(msg => {
                  const isTyping  = msg.id === typingMsgId
                  const displayed = isTyping
                    ? msg.content.slice(0, typedChars)
                    : msg.content
                  const showCursor = isTyping && typedChars < msg.content.length

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
                            : msg.isAgent
                              ? 'bg-blue-50 text-blue-800 rounded-tl-sm border border-blue-200'
                              : 'bg-white text-[#0B1F3A] rounded-tl-sm border border-gray-100 shadow-sm'
                        }`}>
                          {msg.role === 'assistant'
                            ? (
                              <>
                                {parseMarkdown(displayed)}
                                {showCursor && (
                                  <span className="inline-block w-0.5 h-3.5 bg-[#C9A84C] ml-0.5 animate-pulse align-middle" />
                                )}
                              </>
                            )
                            : msg.content
                          }
                        </div>
                        <span className="text-[10px] text-gray-400 px-1">{formatTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  )
                })}

                {/* Handover card */}
                {handover && <HandoverCard handover={handover} />}

                {/* Agent banner */}
                {agentActive && !handover && <AgentBanner />}

                {/* Typing indicator (while waiting for API) */}
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
                      <span className="text-xs text-gray-400">Jade is thinking…</span>
                    </div>
                  </div>
                )}

                {/* Smart suggestions (after typewriter finishes) */}
                {suggestions && !isLoading && !typingMsgId && !(handover?.urgency === 'high') && !agentActive && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {suggestions.map(s => (
                      <button key={s}
                        onClick={() => { setSuggestions(null); void sendMessage(s) }}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-[#C9A84C]/50
                          text-[#0B1F3A] bg-[#C9A84C]/8 hover:bg-[#C9A84C]/15 hover:border-[#C9A84C]
                          transition-all duration-150 font-medium">
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick starters */}
              {showStarters && messages.length > 0 && !(handover?.urgency === 'high') && !agentActive && (
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
              {!(handover?.urgency === 'high') && !agentActive && (
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
                        resize-none outline-none min-h-[20px] max-h-[80px] disabled:opacity-50 leading-relaxed"
                      onInput={e => {
                        const t = e.currentTarget
                        t.style.height = 'auto'
                        t.style.height = `${Math.min(t.scrollHeight, 80)}px`
                      }}
                    />
                    {/* Voice button */}
                    <button
                      type="button"
                      onClick={isListening ? stopVoice : startVoice}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                        isListening
                          ? 'bg-red-500 text-white'
                          : 'text-gray-400 hover:text-[#C9A84C]'
                      }`}
                      title={isListening ? 'Stop listening' : 'Voice input'}>
                      {isListening
                        ? <MicOff className="w-3.5 h-3.5" />
                        : <Mic className="w-3.5 h-3.5" />
                      }
                    </button>
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
                </div>
              )}

              {/* High-urgency handover buttons */}
              {handover?.urgency === 'high' && (
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

// Re-export for backward-compatibility
export { JadeChat as JadeChatWidget }
