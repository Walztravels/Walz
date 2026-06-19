'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Loader2, Copy, Check, RotateCcw,
  Sparkles, FileText, Mail, Shield, Globe, ChevronDown,
} from 'lucide-react'

interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  timestamp: Date
}

const QUICK_ACTIONS = [
  {
    label:  'Visa Checklist',
    icon:   Shield,
    color:  '#1D4ED8',
    prompt: 'Give me the full visa document checklist for a Nigerian passport holder applying for a UK Standard Visitor visa',
  },
  {
    label:  'Draft Email',
    icon:   Mail,
    color:  '#15803D',
    prompt: 'Draft a professional follow-up email to a client who requested a visa quote 3 days ago and hasn\'t responded',
  },
  {
    label:  'Objection Script',
    icon:   FileText,
    color:  '#B45309',
    prompt: 'Write a script for handling a client who says our flight prices are too expensive compared to what they found online',
  },
  {
    label:  'Schengen Guide',
    icon:   Globe,
    color:  '#6D28D9',
    prompt: 'Give me a complete Schengen visa guide for a Ghanaian passport holder — requirements, processing time, common refusals',
  },
]

const TYPING_PHRASES = ['Jade is thinking…', 'Consulting the knowledge base…', 'Drafting response…']

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let listItems: string[] = []
  let orderedItems: string[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  const flushList = () => {
    if (listItems.length) {
      result.push(
        <ul key={result.length} className="list-disc list-inside space-y-1 my-2 text-sm text-gray-200">
          {listItems.map((item, i) => <li key={i}>{parseLine(item)}</li>)}
        </ul>
      )
      listItems = []
    }
    if (orderedItems.length) {
      result.push(
        <ol key={result.length} className="list-decimal list-inside space-y-1 my-2 text-sm text-gray-200">
          {orderedItems.map((item, i) => <li key={i}>{parseLine(item)}</li>)}
        </ol>
      )
      orderedItems = []
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push(
          <pre key={result.length} className="bg-[#0B1F3A] border border-[#C9A84C]/20 rounded-lg p-3 my-2 overflow-x-auto text-xs text-[#C9A84C] font-mono">
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []; inCodeBlock = false
      } else { flushList(); inCodeBlock = true }
      continue
    }
    if (inCodeBlock) { codeLines.push(line); continue }

    if (/^#{1,3}\s/.test(line)) {
      flushList()
      const text = line.replace(/^#{1,3}\s/, '')
      result.push(<h3 key={result.length} className="text-[#C9A84C] font-bold text-sm mt-4 mb-1">{text}</h3>)
    } else if (/^[-*•]\s/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s/, ''))
    } else if (/^\d+\.\s/.test(line)) {
      flushList()
      orderedItems.push(line.replace(/^\d+\.\s/, ''))
    } else if (line.trim() === '') {
      flushList()
      result.push(<br key={result.length} />)
    } else {
      flushList()
      result.push(<p key={result.length} className="text-sm text-gray-200 leading-relaxed mb-1">{parseLine(line)}</p>)
    }
  }
  flushList()
  return result
}

function parseLine(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[1]) parts.push(<strong key={match.index} className="text-white font-semibold">{match[1]}</strong>)
    if (match[2]) parts.push(<code key={match.index} className="bg-[#C9A84C]/20 text-[#C9A84C] px-1 py-0.5 rounded text-xs font-mono">{match[2]}</code>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-[#C9A84C] transition-colors mt-2">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function StaffJadePage() {
  const [messages,     setMessages]     = useState<Message[]>([])
  const [input,        setInput]        = useState('')
  const [isLoading,    setIsLoading]    = useState(false)
  const [typingPhrase, setTypingPhrase] = useState(TYPING_PHRASES[0])
  const [showActions,  setShowActions]  = useState(true)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const historyRef      = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const typingInterval  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isLoading) {
      let i = 0
      typingInterval.current = setInterval(() => {
        i = (i + 1) % TYPING_PHRASES.length
        setTypingPhrase(TYPING_PHRASES[i])
      }, 1500)
    } else {
      if (typingInterval.current) clearInterval(typingInterval.current)
    }
    return () => { if (typingInterval.current) clearInterval(typingInterval.current) }
  }, [isLoading])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async (text?: string) => {
    const userMessage = (text ?? input).trim()
    if (!userMessage || isLoading) return

    setInput('')
    setShowActions(false)

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   userMessage,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const res = await fetch('/api/admin/jade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversationHistory: historyRef.current }),
      })
      const data = await res.json()
      const reply: string = data.reply ?? 'Sorry, I encountered an error. Please try again.'

      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const,      content: userMessage },
        { role: 'assistant' as const, content: reply },
      ].slice(-30)

      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   reply,
        timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   'I encountered a connection error. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  const handleReset = () => {
    setMessages([]); historyRef.current = []; setShowActions(true); setInput('')
  }

  const formatTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0B1F3A]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#E8D08A] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#0B1F3A]" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-none">Jade Staff Assistant</h1>
            <p className="text-[#C9A84C] text-xs mt-0.5">Your AI colleague — visa expert, sales coach, ops assistant</p>
          </div>
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-400 font-medium">Online</span>
          </div>
        </div>
        <button onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
          <RotateCcw className="w-3.5 h-3.5" /> New chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Welcome */}
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#C9A84C] to-[#E8D08A] flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-[#0B1F3A]" />
            </div>
            <h2 className="text-white font-bold text-lg mb-2">Hi, I&apos;m Jade</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Your AI colleague at Walz Travels. Ask me for visa checklists, email drafts, objection scripts, destination guides, or anything else to help you work faster.
            </p>
          </div>
        )}

        {/* Quick actions */}
        {showActions && messages.length === 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3 text-center">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(action => {
                const Icon = action.icon
                return (
                  <button key={action.label} onClick={() => void sendMessage(action.prompt)}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-white/10 bg-white/5
                      hover:bg-white/10 hover:border-[#C9A84C]/40 transition-all text-left group">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: action.color + '25', border: `1px solid ${action.color}40` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: action.color }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors leading-tight mt-0.5">
                      {action.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>

              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#E8D08A] flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-[#0B1F3A]" />
                  </div>
                  <span className="text-[10px] text-gray-500">Jade · {formatTime(msg.timestamp)}</span>
                </div>
              )}

              <div className={`px-4 py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-[#C9A84C] text-[#0B1F3A] rounded-tr-sm font-medium text-sm'
                  : 'bg-[#132840] text-gray-200 rounded-tl-sm border border-white/10'
              }`}>
                {msg.role === 'user'
                  ? msg.content
                  : parseMarkdown(msg.content)
                }
              </div>

              {msg.role === 'assistant' && <CopyButton text={msg.content} />}

              {msg.role === 'user' && (
                <span className="text-[10px] text-gray-600 px-1">{formatTime(msg.timestamp)}</span>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#132840] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-gray-500">{typingPhrase}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions after first reply */}
      {messages.length > 0 && !isLoading && (
        <div className="px-6 pb-2 flex-shrink-0">
          <button onClick={() => setShowActions(p => !p)}
            className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
            <ChevronDown className={`w-3 h-3 transition-transform ${showActions ? 'rotate-180' : ''}`} />
            {showActions ? 'Hide quick actions' : 'Show quick actions'}
          </button>
          {showActions && (
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {QUICK_ACTIONS.map(action => {
                const Icon = action.icon
                return (
                  <button key={action.label} onClick={() => void sendMessage(action.prompt)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 bg-white/5
                      hover:bg-white/10 hover:border-[#C9A84C]/40 transition-all text-left">
                    <Icon className="w-3 h-3 flex-shrink-0" style={{ color: action.color }} />
                    <span className="text-[10px] text-gray-400 truncate">{action.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-6 pb-6 pt-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-end gap-3 bg-[#132840] rounded-2xl px-4 py-3
          border border-white/10 focus-within:border-[#C9A84C]/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Jade anything — visa checklists, email drafts, objection scripts..."
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600
              resize-none outline-none min-h-[20px] max-h-[120px] disabled:opacity-50 leading-relaxed"
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={isLoading || !input.trim()}
            className="w-8 h-8 rounded-xl bg-[#C9A84C] flex items-center justify-center
              disabled:opacity-30 hover:bg-[#E8D08A] active:scale-95 transition-all flex-shrink-0">
            {isLoading
              ? <Loader2 className="w-4 h-4 text-[#0B1F3A] animate-spin" />
              : <Send className="w-4 h-4 text-[#0B1F3A]" />
            }
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-2">
          Jade AI · Walz Travels Staff Assistant · Claude Sonnet 4.6
        </p>
      </div>
    </div>
  )
}
