'use client'

// useStaffJadeChat — headless Staff Jade chat engine (INBOX UX-2 Phase B).
//
// Extracted from JadeStaffWidget so the floating staff widget and the inbox
// InboxJadeCopilot share ONE client for the existing staff engine at
// POST /api/admin/jade/chat:
//   - localStorage session persistence parameterized by sessionKey
//     (2h TTL, stored messages capped so the store never grows unbounded);
//   - '__init__' greeting handshake (staffName + page-aware suggestions);
//   - send() with the engine's exact wire shape: { message, context,
//     conversationHistory } where history is the last `maxHistory` messages
//     truncated to 500 chars each and context comes from contextBuilder().
//
// No JSX lives here — panel/FAB chrome stays with each consumer.

import { useState, useRef, useEffect, useCallback } from 'react'

export type JadeChatMessage = {
  role: 'user' | 'assistant'
  content: string
  time: Date
  suggestions?: string[]
}

export type JadeChatState = 'idle' | 'thinking'

const SESSION_TTL = 2 * 60 * 60 * 1000

/** Stored sessions cap at 40 messages — stops unbounded localStorage growth. */
export const MAX_STORED_MESSAGES = 40

type StoredSession = {
  messages: Array<{ role: 'user' | 'assistant'; content: string; time: string; suggestions?: string[] }>
  staffName: string
  savedAt: number
}

function loadSession(sessionKey: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey)
    if (!raw) return null
    const s: StoredSession = JSON.parse(raw)
    if (Date.now() - s.savedAt > SESSION_TTL) {
      localStorage.removeItem(sessionKey)
      return null
    }
    return s
  } catch { return null }
}

function saveSession(sessionKey: string, messages: JadeChatMessage[], staffName: string) {
  try {
    const s: StoredSession = {
      messages: messages
        .slice(-MAX_STORED_MESSAGES)
        .map(m => ({ ...m, time: m.time.toISOString() })),
      staffName,
      savedAt: Date.now(),
    }
    localStorage.setItem(sessionKey, JSON.stringify(s))
  } catch { /* quota exceeded or private mode */ }
}

export const GREETINGS = [
  (name: string) => `Hey ${name} 👋 What do you need?`,
  (name: string) => `${name}! What's up?`,
  (name: string) => `Right, what can I help with ${name}?`,
  (name: string) => `Hey — good to see you ${name}. Fire away.`,
]

export const THINKING_PHRASES = [
  'On it...',
  'Just a sec...',
  'Let me think...',
  'Checking...',
  'Got it, one moment...',
]

export interface UseStaffJadeChatOptions {
  /** localStorage key for this surface's session (each surface gets its own). */
  sessionKey: string
  /** Built fresh per request — becomes the POST body's `context` field. */
  contextBuilder: () => Record<string, unknown>
  /** How many recent messages ride along as conversationHistory (default 8). */
  maxHistory?: number
  /** Fired after each successful assistant reply (e.g. unread badges). */
  onAssistantReply?: () => void
}

export interface UseStaffJadeChatResult {
  messages: JadeChatMessage[]
  input: string
  setInput: (value: string) => void
  jadeState: JadeChatState
  suggestions: string[]
  staffName: string
  send: (text?: string) => Promise<void>
  initialize: () => Promise<void>
  clearSession: () => void
  /** True once a session was restored or initialize() ran. */
  initialized: boolean
  thinkingPhrase: string
}

export function useStaffJadeChat(options: UseStaffJadeChatOptions): UseStaffJadeChatResult {
  const { sessionKey } = options

  const [messages, setMessages] = useState<JadeChatMessage[]>([])
  const [input, setInput] = useState('')
  const [jadeState, setJadeState] = useState<JadeChatState>('idle')
  const [staffName, setStaffName] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [thinkingPhrase] = useState(
    () => THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
  )

  const historyRef = useRef<JadeChatMessage[]>([])
  const inputRef = useRef('')
  const jadeStateRef = useRef<JadeChatState>('idle')

  // Session epoch — clearSession() bumps it, and any in-flight send() that
  // resolves afterwards DISCARDS its result (no setMessages, no save), so a
  // response for one session can never bleed into the next.
  const epochRef = useRef(0)

  // Always call the latest options (contextBuilder closes over fresh props).
  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })

  // Restore session from localStorage on first mount (per sessionKey).
  useEffect(() => {
    const saved = loadSession(sessionKey)
    if (saved && saved.messages.length > 0) {
      const restored = saved.messages.map(m => ({ ...m, time: new Date(m.time) }))
      setMessages(restored)
      setStaffName(saved.staffName)
      setInitialized(true)
    }
  }, [sessionKey])

  // Sync history to ref and persist session whenever messages change.
  useEffect(() => {
    historyRef.current = messages
    if (messages.length > 0) saveSession(sessionKey, messages, staffName)
  }, [messages, staffName, sessionKey])

  useEffect(() => { inputRef.current = input }, [input])
  useEffect(() => { jadeStateRef.current = jadeState }, [jadeState])

  const initialize = useCallback(async () => {
    setInitialized(true)
    try {
      const res = await fetch('/api/admin/jade/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '__init__',
          context: optionsRef.current.contextBuilder(),
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
  }, [])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? inputRef.current).trim()
    if (!msg || msg === '__init__' || jadeStateRef.current !== 'idle') return

    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }])
    setInput('')
    jadeStateRef.current = 'thinking'
    setJadeState('thinking')

    // Capture the epoch before the fetch — if clearSession() runs while this
    // request is in flight, the stale result is discarded on resolution.
    const epoch = epochRef.current

    try {
      const res = await fetch('/api/admin/jade/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: optionsRef.current.contextBuilder(),
          conversationHistory: historyRef.current
            .slice(-(optionsRef.current.maxHistory ?? 8))
            .map(m => ({ role: m.role, content: m.content.substring(0, 500) })),
        }),
      })

      if (epochRef.current !== epoch) return // stale session — discard the result

      // Distinct surfacing for an oversized request — the generic unavailable
      // text stays reserved for real failures.
      if (res.status === 413) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'That message is too long for Jade — try something shorter.',
          time: new Date(),
        }])
        return
      }

      const data = await res.json() as {
        response?: string
        error?: string
        staffName?: string
        suggestions?: string[]
      }

      if (epochRef.current !== epoch) return // stale session — discard the result

      if (data.error) throw new Error(data.error)

      if (data.staffName) setStaffName(prev => prev || data.staffName || '')
      if (data.suggestions?.length) setSuggestions(data.suggestions)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || "I didn't catch that — try rephrasing?",
        time: new Date(),
        suggestions: data.suggestions,
      }])
      optionsRef.current.onAssistantReply?.()
    } catch {
      if (epochRef.current === epoch) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Jade is unavailable right now. Try again in a moment.",
          time: new Date(),
        }])
      }
    } finally {
      jadeStateRef.current = 'idle'
      setJadeState('idle')
    }
  }, [])

  const clearSession = useCallback(() => {
    epochRef.current += 1 // invalidate any in-flight send() for the old session
    try { localStorage.removeItem(optionsRef.current.sessionKey) } catch { /* ignore */ }
    historyRef.current = []
    setMessages([])
    setSuggestions([])
    setInput('')
    setInitialized(false)
  }, [])

  return {
    messages,
    input,
    setInput,
    jadeState,
    suggestions,
    staffName,
    send,
    initialize,
    clearSession,
    initialized,
    thinkingPhrase,
  }
}
