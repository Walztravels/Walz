'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Loader2, MessageCircle, Phone, RefreshCw, ExternalLink } from 'lucide-react'

interface CWMessage {
  id:           number
  content:      string
  message_type: number // 0=incoming 1=outgoing 2=activity
  created_at:   number
  private:      boolean
  sender?: { name: string; type: string }
}

interface Props {
  conversationId: number
  clientName:     string
  clientPhone:    string
  applicationType: string
  refNumber:      string
  onClose:        () => void
}

const DEPT_LABELS: Record<string, { label: string; emoji: string }> = {
  VISA:    { label: 'Visa Department',  emoji: '🛂' },
  TOUR:    { label: 'Tours Team',       emoji: '✈️' },
  HOTEL:   { label: 'Reservations',     emoji: '🏨' },
  FLIGHT:  { label: 'Flights Team',     emoji: '✈️' },
  TRANSFER:{ label: 'Transfers Team',   emoji: '🚗' },
  OTHER:   { label: 'Walz Travels',     emoji: '👋' },
}

function timeStr(ts: number) {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function WhatsAppDrawer({ conversationId, clientName, clientPhone, applicationType, refNumber, onClose }: Props) {
  const [messages, setMessages]   = useState<CWMessage[]>([])
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const dept                      = DEPT_LABELS[applicationType] ?? DEPT_LABELS.OTHER

  const welcomeDraft = `Hello ${clientName}, this is the *${dept.emoji} ${dept.label}* at *Walz Travels*.\n\nThis message is regarding your application ref: *${refNumber}*.\n\nHow can we assist you today?`

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/admin/conversations/${conversationId}/messages`)
    if (!res.ok) return
    const data = await res.json()
    const msgs: CWMessage[] = data?.payload || data?.data?.payload || []
    setMessages(msgs.filter(m => m.message_type !== 2).sort((a, b) => a.created_at - b.created_at))
    setLoading(false)
  }, [conversationId])

  useEffect(() => {
    fetchMessages()
    const t = setInterval(fetchMessages, 5000)
    return () => clearInterval(t)
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    await fetch(`/api/admin/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.trim(), private: false }),
    })
    setText('')
    await fetchMessages()
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#0B1F3A] text-white flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{clientName}</div>
            <div className="flex items-center gap-1 text-white/60 text-xs mt-0.5">
              <Phone className="w-3 h-3" />
              <span>{clientPhone}</span>
              <span className="mx-1">·</span>
              <span className="text-[#C9A84C] font-semibold">{dept.emoji} {dept.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchMessages}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/admin/inbox?lead=${conversationId}`}
              target="_blank"
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Open in inbox"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ref badge */}
        <div className="px-4 py-1.5 bg-[#C9A84C]/10 border-b border-[#C9A84C]/20 text-xs text-[#0B1F3A] font-semibold flex items-center gap-2">
          <span className="text-gray-400">Ref:</span> {refNumber}
          <span className="ml-auto text-gray-400 font-normal">via WhatsApp · Chatwoot #{conversationId}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#f0f4f8]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm text-center">
              <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
              <p>No messages yet.</p>
              <p className="text-xs mt-1">Use the pre-draft below to start the conversation.</p>
            </div>
          ) : (
            messages.map(msg => {
              const isOutgoing = msg.message_type === 1
              return (
                <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm shadow-sm ${
                    isOutgoing
                      ? 'bg-[#0B1F3A] text-white rounded-tr-sm'
                      : 'bg-white text-gray-800 rounded-tl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap leading-snug">{msg.content}</p>
                    <p className={`text-[10px] mt-1 text-right ${isOutgoing ? 'text-white/50' : 'text-gray-400'}`}>
                      {timeStr(msg.created_at)}
                      {msg.sender?.name && !isOutgoing && ` · ${msg.sender.name}`}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Pre-draft button */}
        {messages.length === 0 && !text && (
          <div className="px-4 py-2 border-t border-gray-100 bg-white flex-shrink-0">
            <button
              onClick={() => setText(welcomeDraft)}
              className="w-full text-xs text-left px-3 py-2 rounded-xl border border-dashed border-[#C9A84C]/50 text-[#C9A84C] hover:bg-[#C9A84C]/5 transition-colors font-semibold"
            >
              📋 Insert welcome message for {dept.label}
            </button>
          </div>
        )}

        {/* Reply box */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              rows={3}
              className="flex-1 resize-none px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] transition-colors"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!text.trim() || sending}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500 hover:bg-green-600 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Messages send via WhatsApp through Chatwoot · Shift+Enter for new line
          </p>
        </div>

      </div>
    </div>
  )
}
