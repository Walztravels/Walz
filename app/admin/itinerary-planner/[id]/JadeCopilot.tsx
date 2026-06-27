'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  itinerary?: Record<string, unknown>
  model?: string
  timestamp: Date
}

interface GeneratedItinerary {
  title?: string
  destination?: string
  days?: unknown[]
  flights?: unknown[]
  hotels?: unknown[]
  tours?: unknown[]
  totalPrice?: number
  currency?: string
  suggestions?: string[]
  copilotNotes?: string
}

const EXAMPLE_PROMPTS = [
  '7-night luxury honeymoon Dubai, 2 pax, £8,000 budget, Emirates business class from LHR',
  '10 days Canada family trip, 4 people (2 adults, kids 8 & 12), fly Toronto then Vancouver, CAD 15,000',
  'Long weekend Paris, couple, boutique hotel, food & wine focus, Eurostar from London',
  '14 nights Bali & Singapore multi-stop, solo traveller, mid-range budget £4,000',
  '5 nights Maldives water villa honeymoon, direct from Heathrow, £12k total',
  'Paste a booking confirmation email and I\'ll extract all the details automatically',
]

function parseSimpleMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const parts: React.ReactNode[] = []
    let remaining = line
    let keyIdx = 0

    // Bold: **text**
    while (remaining.includes('**')) {
      const start = remaining.indexOf('**')
      const end = remaining.indexOf('**', start + 2)
      if (end === -1) break
      if (start > 0) parts.push(remaining.slice(0, start))
      parts.push(<strong key={keyIdx++} className="text-white font-semibold">{remaining.slice(start + 2, end)}</strong>)
      remaining = remaining.slice(end + 2)
    }

    // Italic: _text_
    if (remaining.includes('_')) {
      const start = remaining.indexOf('_')
      const end = remaining.indexOf('_', start + 1)
      if (start !== -1 && end !== -1) {
        if (start > 0) parts.push(remaining.slice(0, start))
        parts.push(<em key={keyIdx++} className="text-white/40 text-xs not-italic">{remaining.slice(start + 1, end)}</em>)
        remaining = remaining.slice(end + 1)
      }
    }

    if (remaining) parts.push(remaining)

    return (
      <span key={i}>
        {parts.length > 0 ? parts : line}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    )
  })
}

export function JadeCopilot({
  itinerary,
  onItineraryUpdate,
  onClose,
}: {
  itinerary: Record<string, unknown> | null
  onItineraryUpdate: () => Promise<void>
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm Jade ✈️\n\nI can build a complete itinerary from anything you type.\n\nTry:\n• **Describing a trip** in plain English\n• **Pasting a client's WhatsApp message**\n• **Pasting a booking confirmation** email\n• A quick brief like _"Dubai 7 nights honeymoon £8k"_`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const detectMode = useCallback((text: string): 'generate' | 'refine' | 'parse' => {
    const lower = text.toLowerCase()
    const looksLikeConfirmation =
      text.includes('PNR') ||
      text.includes('Confirmation') ||
      text.includes('Booking Reference') ||
      text.includes('Dear ') ||
      text.includes('booking is confirmed') ||
      text.includes('reservation number')

    const looksLikeRefinement =
      messages.length > 1 && (
        lower.startsWith('change') ||
        lower.startsWith('add') ||
        lower.startsWith('remove') ||
        lower.startsWith('update') ||
        lower.startsWith('make it') ||
        lower.startsWith('can you') ||
        lower.startsWith('upgrade') ||
        lower.startsWith('replace') ||
        lower.startsWith('swap')
      )

    if (looksLikeConfirmation) return 'parse'
    if (looksLikeRefinement) return 'refine'
    return 'generate'
  }, [messages.length])

  const send = async () => {
    if (!input.trim() || loading) return

    const text = input.trim()
    const detectedMode = detectMode(text)

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const history = messages
      .filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0)
      .map(m => ({
        role: m.role,
        content: m.role === 'assistant' && m.itinerary
          ? `Jade generated: ${m.itinerary.title} — ${m.itinerary.destination}, ${(m.itinerary.days as unknown[])?.length || 0} days`
          : m.content.substring(0, 400),
      }))

    try {
      const res = await fetch('/api/admin/itineraries/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          itineraryId: itinerary?.id,
          conversationHistory: history,
          mode: detectedMode,
          currentItinerary: detectedMode === 'refine' && itinerary ? {
            title: itinerary.title,
            destination: itinerary.destination,
            days: safeParseJson(String(itinerary.days || '[]')),
            flights: safeParseJson(String(itinerary.flights || '[]')),
            hotels: safeParseJson(String(itinerary.hotels || '[]')),
          } : null,
        }),
      })

      const data = await res.json() as {
        success?: boolean
        error?: string
        itinerary?: GeneratedItinerary
        model?: string
      }

      if (data.success && data.itinerary) {
        const itin = data.itinerary
        const dayCount = itin.days?.length || 0
        const flightCount = itin.flights?.length || 0
        const hotelCount = itin.hotels?.length || 0
        const tourCount = itin.tours?.length || 0
        const sym = itin.currency === 'USD' ? '$' : itin.currency === 'EUR' ? '€' : itin.currency === 'NGN' ? '₦' : '£'
        const modelLabel = data.model === 'gpt-4o' ? 'GPT-4o' : 'Claude Sonnet'

        let summary = `✅ ${detectedMode === 'parse' ? 'Extracted' : detectedMode === 'refine' ? 'Updated' : 'Generated'} **${itin.title || 'your itinerary'}**\n\n`
        summary += `📍 ${itin.destination || 'Multi-destination'} · ${dayCount} days\n`
        if (flightCount > 0) summary += `✈️ ${flightCount} flight${flightCount > 1 ? 's' : ''}\n`
        if (hotelCount > 0) summary += `🏨 ${hotelCount} hotel${hotelCount > 1 ? 's' : ''}\n`
        if (tourCount > 0) summary += `🎭 ${tourCount} tour${tourCount > 1 ? 's' : ''}\n`
        if (itin.totalPrice) summary += `💰 Total: ${sym}${Number(itin.totalPrice).toLocaleString()}\n`
        summary += `\n_Powered by ${modelLabel}_`

        if (itin.suggestions?.length) {
          summary += '\n\n💡 **Suggestions:**\n'
          itin.suggestions.slice(0, 3).forEach(s => { summary += `• ${s}\n` })
        }

        if (itin.copilotNotes) {
          summary += `\n\n📝 ${itin.copilotNotes}`
        }

        summary += '\n\nThe itinerary has been saved. Ask me to:\n• "add a spa day on day 3"\n• "upgrade the hotel to Burj Al Arab"\n• "add airport transfers"\n• "make the budget more affordable"'

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: summary,
          itinerary: itin as unknown as Record<string, unknown>,
          model: data.model,
          timestamp: new Date(),
        }])

        await onItineraryUpdate()
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ ${data.error || 'Something went wrong. Please try again.'}`,
          timestamp: new Date(),
        }])
      }
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Network error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const detectedMode = input.length > 15 ? detectMode(input) : null

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-[#0B1F3A] border-l border-white/10 flex flex-col z-40 shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-[#0B1F3A] to-[#0d2a4a] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-lg">✈️</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm">Jade Copilot</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <p className="text-white/30 text-xs">GPT-4o + Claude Sonnet</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white transition text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs">✈️</span>
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-amber-500 text-black font-medium rounded-tr-sm'
                : 'bg-white/[0.08] text-white/80 rounded-tl-sm'
            }`}>
              {parseSimpleMarkdown(msg.content)}
              {msg.model && msg.role === 'assistant' && (
                <p className="text-white/20 text-[10px] mt-2 border-t border-white/10 pt-1">
                  {msg.model === 'gpt-4o' ? '⚡ GPT-4o' : '🤖 Claude Sonnet'}
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs">✈️</span>
            </div>
            <div className="bg-white/[0.08] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
                <span className="text-white/40 text-xs">Jade is thinking…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Example prompts — only shown on first load */}
      {messages.length <= 1 && !loading && (
        <div className="px-4 pb-3 flex-shrink-0">
          <p className="text-white/20 text-[10px] mb-2 font-bold uppercase tracking-wider">Try an example</p>
          <div className="space-y-1.5">
            {EXAMPLE_PROMPTS.slice(0, 3).map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => setInput(prompt)}
                className="w-full text-left text-xs text-white/40 hover:text-white/70 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl px-3 py-2 transition leading-relaxed"
              >
                {prompt.length > 70 ? prompt.substring(0, 70) + '…' : prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 border-t border-white/10 pt-3 flex-shrink-0">
        {detectedMode && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-white/20 text-xs">Jade will</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              detectedMode === 'parse'  ? 'bg-blue-500/20 text-blue-400' :
              detectedMode === 'refine' ? 'bg-purple-500/20 text-purple-400' :
                                          'bg-amber-500/20 text-amber-400'
            }`}>
              {detectedMode === 'parse'  ? '📋 extract booking details' :
               detectedMode === 'refine' ? '✏️ refine the itinerary' :
                                           '✨ generate itinerary'}
            </span>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Describe the trip, paste a booking confirmation, or ask Jade to update…"
            rows={3}
            className="w-full bg-white/[0.08] border border-white/[0.15] hover:border-white/25 focus:border-amber-500/50 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none resize-none leading-relaxed pr-12"
          />
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center transition ${
              loading || !input.trim()
                ? 'bg-white/10 text-white/20'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
          >
            {loading ? (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-white/15 text-xs mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

function safeParseJson(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
