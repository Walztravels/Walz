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

interface SearchParams {
  from: string
  to: string
  date: string
  returnDate: string
  adults: number
}

interface FlightResult {
  type: 'flight'
  id: string
  summary: string
  from: string
  to: string
  date: unknown
  departureTime: string
  arrivalTime: string
  airline: string
  flightNumber: string
  class: string
  price: number
  currency: string
  stops: number
}

// ── Admin Jade trip context — ONLY fields Jade actually reads ─────────────
// Never add supplierCost, rateKey, offerId, PNRs, passport data, or
// payment credentials here. Server re-fetches authoritative data from DB.

export interface AdminJadeTripContext {
  id: string
  title?: string
  destination?: string
  currency?: string
  numberOfTravellers?: number
}

// ── Context model ──────────────────────────────────────────────────────────

export interface JadeContext {
  activeTab: string
  bookingType?: string
  editingBookingSummary?: string
  dayNumber?: number
  dayTitle?: string
}

type Suggestion = { label: string; prompt?: string; special?: 'flights' | 'hotels' }

function getContextLabel(ctx: JadeContext): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  switch (ctx.activeTab) {
    case 'days':
      if (ctx.dayNumber) {
        const t = ctx.dayTitle && ctx.dayTitle !== `Day ${ctx.dayNumber}` ? ctx.dayTitle : ''
        return `Day ${ctx.dayNumber}${t ? ` · ${t}` : ''}`
      }
      return 'Day-by-Day'
    case 'bookings':
      if (ctx.editingBookingSummary) return `${cap(ctx.bookingType || 'Booking')} · ${ctx.editingBookingSummary}`
      if (ctx.bookingType) return `Bookings · ${cap(ctx.bookingType)}`
      return 'Bookings'
    case 'pricing': return 'Pricing'
    case 'overview': return 'Overview'
    case 'research': return 'Research'
    case 'notes': return 'Notes'
    case 'preview': return 'Preview & Send'
    case 'travelers': return 'Travelers'
    case 'tasks': return 'Tasks'
    default: return cap(ctx.activeTab)
  }
}

function getContextSuggestions(ctx: JadeContext | undefined): Suggestion[] {
  if (!ctx) return [
    { label: '✈ Search Flights', special: 'flights' },
    { label: '🏨 Search Hotels', special: 'hotels' },
    { label: '✨ Generate itinerary', prompt: '' },
  ]
  const rec = ctx.editingBookingSummary
  const d = ctx.dayNumber
    ? `Day ${ctx.dayNumber}${ctx.dayTitle && ctx.dayTitle !== `Day ${ctx.dayNumber}` ? ` — ${ctx.dayTitle}` : ''}`
    : null
  switch (ctx.activeTab) {
    case 'bookings': {
      const bt = ctx.bookingType || 'flights'
      if (bt === 'flights') return rec ? [
        { label: 'Review flight', prompt: `Review this flight: ${rec}. Check timing, connections, and flag any issues.` },
        { label: 'Client summary', prompt: `Write a client-facing summary for this flight: ${rec}.` },
        { label: 'Suggest alternatives', prompt: `Suggest 2–3 alternative flight options to ${rec}.` },
        { label: '✈ Search Flights', special: 'flights' },
      ] : [
        { label: 'Review all flights', prompt: 'Review all flights in this itinerary. Check timing and flag any connections or gaps.' },
        { label: 'Check connections', prompt: 'Check all flight connections and flag any tight layovers or potential issues.' },
        { label: '✈ Search Flights', special: 'flights' },
      ]
      if (bt === 'hotels') return rec ? [
        { label: 'Improve description', prompt: `Write a compelling client-facing description for ${rec}.` },
        { label: 'Review stay', prompt: `Review the hotel stay at ${rec}. Check dates, room type, and suggest improvements.` },
        { label: '🏨 Search Hotels', special: 'hotels' },
      ] : [
        { label: 'Review accommodation', prompt: 'Review all hotels. Check check-in/out dates and flag any gaps or overlaps.' },
        { label: '🏨 Search Hotels', special: 'hotels' },
      ]
      if (bt === 'transfers') return [
        { label: 'Review transfers', prompt: 'Review all transfers. Flag any flight arrivals with no transfer or ground coverage gaps.' },
        { label: 'Suggest vehicles', prompt: 'Suggest appropriate vehicle types for each transfer based on group size and destination.' },
      ]
      if (bt === 'tours') return [
        { label: 'Suggest experiences', prompt: rec ? `Suggest complementary experiences for: ${rec}.` : 'Suggest additional tour experiences for this itinerary destination.' },
        { label: 'Improve description', prompt: rec ? `Write a compelling description for: ${rec}.` : 'Improve the tour descriptions in this itinerary.' },
      ]
      return [
        { label: 'Review bookings', prompt: 'Review all bookings in this itinerary. Flag gaps, mismatches, or missing elements.' },
        { label: 'Check dates', prompt: 'Check all booking dates for consistency. Flag any mismatches.' },
      ]
    }
    case 'days': return d ? [
      { label: 'Improve this day', prompt: `Improve ${d}. Enhance the description, activity sequencing, and make it more client-ready.` },
      { label: 'Add activities', prompt: `Suggest 3–4 additional activities for ${d} that complement the existing plan.` },
      { label: 'Rewrite description', prompt: `Rewrite the client-facing description for ${d} to be more vivid and engaging.` },
      { label: 'Fill free time', prompt: `Suggest optional activities to fill any free time on ${d}.` },
    ] : [
      { label: 'Balance schedule', prompt: 'Review all days and flag any that are overloaded or too sparse. Suggest rebalancing.' },
      { label: 'Add meal suggestions', prompt: 'Suggest restaurant and dining recommendations for the itinerary days.' },
      { label: 'Reduce travel fatigue', prompt: 'Suggest ways to reduce travel fatigue across the itinerary.' },
    ]
    case 'pricing': return [
      { label: 'Review prices', prompt: 'Review the price breakdown. Flag any zero prices, missing items, or inconsistencies.' },
      { label: 'Explain margin', prompt: 'Explain the current margin on this itinerary in simple terms for the team.' },
      { label: 'Check totals', prompt: 'Check that all pricing totals are consistent and complete.' },
    ]
    case 'overview': return [
      { label: 'Improve overview', prompt: 'Improve the trip overview text to be more compelling and client-ready.' },
      { label: 'Summarize itinerary', prompt: 'Write a 3-sentence summary of this itinerary suitable for a client email.' },
      { label: 'Identify gaps', prompt: 'Review this itinerary and identify any missing elements — transfers, accommodation gaps, or incomplete days.' },
    ]
    case 'research': return [
      { label: 'Research destination', prompt: 'Research the destination and provide practical travel information.' },
      { label: 'Activity ideas', prompt: 'Suggest unique activities and experiences for this destination.' },
      { label: 'Practical info', prompt: 'Provide practical travel information — visa requirements, currency, weather, and local customs.' },
    ]
    case 'notes': return [
      { label: 'Summarize notes', prompt: 'Summarize all notes in this itinerary into key action points.' },
      { label: 'Convert to tasks', prompt: 'Convert the notes into actionable tasks for the team.' },
      { label: 'Unresolved items', prompt: 'Identify any unresolved items or open questions from the notes.' },
    ]
    case 'preview': return [
      { label: 'Audit proposal', prompt: 'Audit this proposal for completeness. Identify anything that would prevent sending it to the client.' },
      { label: 'Check client info', prompt: 'Check that all client-facing information is complete — name, dates, prices, inclusions, and contact details.' },
      { label: 'Review readiness', prompt: 'Is this itinerary ready to send to the client? What still needs attention?' },
    ]
    default: return [
      { label: '✈ Search Flights', special: 'flights' },
      { label: '🏨 Search Hotels', special: 'hotels' },
      { label: '✨ Generate itinerary', prompt: '' },
    ]
  }
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
  initialSearchHint,
  onSearchHintConsumed,
  jadeContext,
}: {
  itinerary: AdminJadeTripContext | null
  onItineraryUpdate: () => Promise<void>
  onClose: () => void
  initialSearchHint?: { type: string; destination: string; date: string } | null
  onSearchHintConsumed?: () => void
  jadeContext?: JadeContext
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
  const [searchMode, setSearchMode] = useState<null | 'flights' | 'hotels' | 'activities'>(null)
  const [searchResults, setSearchResults] = useState<FlightResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchParams, setSearchParams] = useState<SearchParams>({
    from: '', to: '', date: '', returnDate: '', adults: 1,
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle initialSearchHint from the OverviewTab flight banner
  useEffect(() => {
    if (initialSearchHint && initialSearchHint.type === 'flights') {
      setSearchMode('flights')
      setSearchParams(prev => ({
        ...prev,
        to: initialSearchHint.destination,
        date: initialSearchHint.date,
      }))
      onSearchHintConsumed?.()
    }
  }, [initialSearchHint]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleFlightSearch = async () => {
    if (!searchParams.from || !searchParams.to || !searchParams.date) return
    setSearchLoading(true)
    setSearchResults([])
    try {
      const res = await fetch(`/api/admin/itineraries/${itinerary?.id as string}/copilot-live-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'flights',
          params: {
            origin: searchParams.from,
            destination: searchParams.to,
            departure_date: searchParams.date,
            return_date: searchParams.returnDate || undefined,
            adults: searchParams.adults,
          },
        }),
      })
      const data = await res.json() as { results?: FlightResult[] }
      setSearchResults(data.results ?? [])
      if (!data.results?.length) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No flights found for those dates. Try adjusting your search or check the dates.',
          timestamp: new Date(),
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Flight search unavailable — Duffel API may not be configured. Add flights manually in the Bookings tab.',
        timestamp: new Date(),
      }])
    }
    setSearchLoading(false)
  }

  const addItemToItinerary = async (result: FlightResult) => {
    const itinId = itinerary?.id as string
    if (!itinId) return
    const flightItem = {
      from: result.from,
      to: result.to,
      airline: result.airline,
      flightNumber: result.flightNumber || '',
      date: result.date,
      time: result.departureTime ? new Date(result.departureTime).toTimeString().slice(0, 5) : '',
      arrivalTime: result.arrivalTime ? new Date(result.arrivalTime).toTimeString().slice(0, 5) : '',
      class: result.class,
      cost: result.price,
      status: 'confirmed',
      notes: '',
      pnr: '',
      iataCode: '',
      supplierId: '',
      duffelOrderId: result.id || '',
      supplierCost: null,
    }
    const res = await fetch(`/api/admin/itineraries/${itinId}/copilot-add-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: 'flight', item: flightItem }),
    })
    if (res.ok) {
      await onItineraryUpdate()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ Flight added to itinerary — ${result.airline} ${result.from}→${result.to}. Check the Bookings → Flights tab.`,
        timestamp: new Date(),
      }])
      setSearchMode(null)
      setSearchResults([])
    }
  }

  const send = async () => {
    if (!input.trim() || loading) return

    const text = input.trim()

    // Detect flight search intent
    const lower = text.toLowerCase()
    if (
      !searchMode &&
      (lower.includes('search flights') || lower.includes('find flights') || lower.includes('look for flights'))
    ) {
      setSearchMode('flights')
      setInput('')
      return
    }

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
          // currentItinerary intentionally omitted: server re-fetches
          // authoritative data from DB using itineraryId. Never send
          // booking arrays here — they contain supplierCost fields.
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

      {/* Context chip — shows what the advisor is currently working on */}
      {jadeContext && (
        <div className="px-4 py-2 border-b border-white/[0.05] flex items-center gap-2 flex-shrink-0 bg-white/[0.015]">
          <span className="text-white/20 text-[9px] uppercase tracking-widest font-bold flex-shrink-0">Working on</span>
          <span className="text-amber-400/65 text-xs font-medium truncate">{getContextLabel(jadeContext)}</span>
        </div>
      )}

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

        {/* Flight search results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-white/40 text-xs font-bold px-1">✈ Flight Results</p>
            {searchResults.map((result, idx) => (
              <div key={idx} className="bg-white/[0.08] rounded-xl p-3">
                <p className="text-white font-bold text-sm">{result.airline} · {result.from}→{result.to}</p>
                <p className="text-white/60 text-xs">{result.summary} · {String(result.date ?? '')}</p>
                <p className="text-amber-400 font-bold text-sm mt-1">{result.currency} {result.price?.toLocaleString()}</p>
                <button
                  onClick={() => void addItemToItinerary(result)}
                  className="mt-2 w-full bg-amber-500 text-black font-bold text-xs py-1.5 rounded-lg hover:bg-amber-400 transition"
                >
                  + Add to Itinerary
                </button>
              </div>
            ))}
          </div>
        )}

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

      {/* Context-aware suggestions — always visible, updates with active tab and record */}
      {!loading && (
        <div className="px-4 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
          {getContextSuggestions(jadeContext).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (s.special === 'flights') { setSearchMode('flights'); return }
                if (s.special === 'hotels') { setSearchMode('hotels'); return }
                if (s.prompt !== undefined) setInput(s.prompt)
              }}
              className="text-[11px] bg-white/[0.05] hover:bg-white/[0.10] text-white/45 hover:text-white/75 border border-white/[0.07] px-2.5 py-1 rounded-lg font-medium transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

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

      {/* Flight search form panel */}
      {searchMode === 'flights' && (
        <div className="px-4 pb-3 border-t border-white/10 pt-3 flex-shrink-0 bg-[#0a1a30]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-blue-300 text-xs font-bold">✈ Flight Search</p>
            <button
              onClick={() => { setSearchMode(null); setSearchResults([]) }}
              className="text-white/30 hover:text-white text-xs transition"
            >
              ✕ Cancel
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">From (IATA)</label>
              <input
                value={searchParams.from}
                onChange={e => setSearchParams(p => ({ ...p, from: e.target.value.toUpperCase() }))}
                placeholder="LHR"
                maxLength={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">To (IATA)</label>
              <input
                value={searchParams.to}
                onChange={e => setSearchParams(p => ({ ...p, to: e.target.value.toUpperCase() }))}
                placeholder="DXB"
                maxLength={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Departure</label>
              <input
                type="date"
                value={searchParams.date}
                onChange={e => setSearchParams(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Return (opt)</label>
              <input
                type="date"
                value={searchParams.returnDate}
                onChange={e => setSearchParams(p => ({ ...p, returnDate: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="text-white/30 text-[10px] font-bold uppercase block mb-1">Adults</label>
              <input
                type="number"
                min={1}
                max={9}
                value={searchParams.adults}
                onChange={e => setSearchParams(p => ({ ...p, adults: Number(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
          <button
            onClick={() => void handleFlightSearch()}
            disabled={searchLoading || !searchParams.from || !searchParams.to || !searchParams.date}
            className="w-full bg-blue-500 text-white font-bold text-xs py-2 rounded-lg hover:bg-blue-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {searchLoading
              ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Searching…</>
              : '✈ Search Flights'}
          </button>
        </div>
      )}

      {/* Hotels / Activities message panels */}
      {searchMode === 'hotels' && (
        <div className="px-4 pb-3 border-t border-white/10 pt-3 flex-shrink-0 bg-[#0a1a30]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-purple-300 text-xs font-bold">🏨 Hotel Search</p>
            <button onClick={() => setSearchMode(null)} className="text-white/30 hover:text-white text-xs transition">✕ Cancel</button>
          </div>
          <p className="text-white/50 text-xs leading-relaxed">Hotel live search coming soon. Use the <strong className="text-white/70">Bookings → Hotels</strong> tab to add hotels manually, or paste a hotel website URL to fetch images.</p>
        </div>
      )}

      {searchMode === 'activities' && (
        <div className="px-4 pb-3 border-t border-white/10 pt-3 flex-shrink-0 bg-[#0a1a30]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-green-300 text-xs font-bold">🎭 Activity Search</p>
            <button onClick={() => setSearchMode(null)} className="text-white/30 hover:text-white text-xs transition">✕ Cancel</button>
          </div>
          <p className="text-white/50 text-xs leading-relaxed">Describe the activity you need in the chat below and Jade will generate itinerary details for it.</p>
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
