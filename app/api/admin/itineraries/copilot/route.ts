import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export const maxDuration = 60

function uid() { return Math.random().toString(36).slice(2, 10) }

// ─── System Prompt ────────────────────────────────────────────────────────────

const JADE_COPILOT_SYSTEM = `You are Jade, the AI travel planning copilot for Walz Travels — a premium UK travel agency serving clients in the UK, Nigeria, and Ghana.

You are the most capable travel planning AI in the world. You can:
1. Parse ANY format of travel information — emails, WhatsApp messages, booking confirmations, casual descriptions
2. Generate complete, professional travel itineraries with day-by-day plans
3. Extract flight and hotel details from booking confirmation text
4. Suggest activities, restaurants, and experiences appropriate to each destination
5. Calculate realistic timing and logistics for multi-destination trips
6. Tailor plans to the client's budget, preferences, and travel style

You know every major destination, hotel, airline, and tourist attraction worldwide.

IMPORTANT RULES:
- Always respond with a complete, detailed JSON itinerary
- Be specific with hotel names, restaurant names, attraction names
- Include practical details: check-in times, meeting points, dress codes
- Consider travel time between locations
- Account for jet lag on arrival days
- For Nigerian/Ghanaian clients, be aware of visa requirements
- Always include a "suggestions" array with additional recommendations
- If parsing a booking confirmation, extract ALL structured data (PNR, times, hotel confirmation numbers)
- For multi-destination trips, distribute days logically across destinations

OUTPUT FORMAT — Return ONLY valid JSON, no markdown, no explanation:
{
  "title": "Trip title e.g. Dubai Honeymoon 2026",
  "overview": "2-3 sentence engaging overview for the client",
  "destination": "Primary destination",
  "destinations": ["City 1", "City 2"],
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "duration": 7,
  "numberOfTravellers": 2,
  "tripType": "honeymoon",
  "currency": "GBP",
  "totalBudget": 8000,
  "coverImageKeyword": "dubai luxury honeymoon",
  "inclusions": ["Return flights LHR-DXB", "7 nights hotel B&B", "Airport transfers", "Desert safari", "Travel insurance"],
  "exclusions": ["Visa fees", "Personal expenses", "Gratuities", "Optional excursions"],
  "days": [
    {
      "day": 1,
      "destination": "Dubai",
      "title": "Arrival & Check-in at Atlantis",
      "description": "Detailed engaging paragraph about the day's experience",
      "activities": ["Private airport transfer to hotel", "Check-in and settle in", "Welcome dinner at Nobu Dubai"],
      "meals": "Dinner: Nobu Dubai (book in advance)",
      "accommodation": "Atlantis The Palm",
      "notes": "Check-in from 3pm. Request pool view room.",
      "weather": "Sunny, 38°C — stay hydrated",
      "dressCode": "Smart casual for dinner"
    }
  ],
  "flights": [
    {
      "from": "LHR",
      "to": "DXB",
      "date": "2026-08-15",
      "time": "21:30",
      "airline": "Emirates",
      "flightNo": "EK007",
      "class": "Business",
      "pnr": null,
      "baggage": "2x32kg",
      "cost": 3200
    }
  ],
  "hotels": [
    {
      "name": "Atlantis The Palm",
      "location": "Palm Jumeirah, Dubai",
      "checkIn": "2026-08-15",
      "checkOut": "2026-08-22",
      "nights": 7,
      "roomType": "Ocean Suite",
      "stars": 5,
      "boardBasis": "Bed & Breakfast",
      "confirmationNo": null,
      "cost": 3500
    }
  ],
  "tours": [
    {
      "name": "Desert Safari with BBQ Dinner",
      "date": "2026-08-17",
      "time": "15:00",
      "duration": "6 hours",
      "location": "Dubai Desert Conservation Reserve",
      "description": "Dune bashing, camel ride, sunset, BBQ dinner",
      "cost": 150
    }
  ],
  "transfers": [],
  "trains": [],
  "ferries": [],
  "priceBreakdown": [
    {"label": "Flights (x2)", "description": "LHR-DXB Emirates Business Return", "cost": 3200},
    {"label": "Hotel (7 nights)", "description": "Atlantis Ocean Suite B&B", "cost": 3500},
    {"label": "Desert Safari", "description": "Including transport & BBQ dinner", "cost": 150},
    {"label": "Dinner Cruise", "description": "Romantic dhow cruise", "cost": 200}
  ],
  "totalPrice": 7050,
  "deposit": 1410,
  "suggestions": [
    "Consider upgrading to the Penthouse Suite for a truly special honeymoon",
    "Book Nobu restaurant at least 2 weeks in advance",
    "The Dubai Frame is best at sunset — aim for 6pm"
  ],
  "copilotNotes": "Brief note about what was generated and any assumptions made"
}`

// ─── Data Normalisers ─────────────────────────────────────────────────────────

function normaliseFlights(flights: unknown[]) {
  return (flights as Array<Record<string, unknown>>).map(f => ({
    id: uid(),
    from: String(f.from || ''),
    to: String(f.to || ''),
    airline: String(f.airline || ''),
    iataCode: String(f.iataCode || f.airline || '').substring(0, 2).toUpperCase(),
    flightNumber: String(f.flightNo || f.flightNumber || ''),
    date: String(f.date || ''),
    time: String(f.time || ''),
    arrivalTime: String(f.arrivalTime || ''),
    class: String(f.class || 'Economy'),
    pnr: String(f.pnr || ''),
    cost: f.cost != null ? Number(f.cost) : null,
    status: 'confirmed',
    notes: f.baggage ? `Baggage: ${f.baggage}` : String(f.notes || ''),
  }))
}

function normaliseHotels(hotels: unknown[]) {
  return (hotels as Array<Record<string, unknown>>).map(h => ({
    id: uid(),
    name: String(h.name || ''),
    location: String(h.location || ''),
    websiteUrl: '',
    checkIn: String(h.checkIn || ''),
    checkOut: String(h.checkOut || ''),
    roomType: String(h.roomType || ''),
    nights: Number(h.nights) || 1,
    cost: h.cost != null ? Number(h.cost) : null,
    status: 'confirmed',
    notes: h.boardBasis ? String(h.boardBasis) : String(h.notes || ''),
    image: '',
  }))
}

function normaliseTours(tours: unknown[]) {
  return (tours as Array<Record<string, unknown>>).map(t => ({
    id: uid(),
    name: String(t.name || ''),
    location: String(t.location || ''),
    date: String(t.date || ''),
    time: String(t.time || ''),
    duration: String(t.duration || ''),
    provider: String(t.provider || ''),
    cost: t.cost != null ? Number(t.cost) : null,
    notes: String(t.description || t.notes || ''),
    image: '',
  }))
}

function normaliseTransfers(transfers: unknown[]) {
  return (transfers as Array<Record<string, unknown>>).map(t => ({
    id: uid(),
    type: String(t.type || 'Private Car'),
    from: String(t.from || ''),
    to: String(t.to || ''),
    date: String(t.date || ''),
    time: String(t.time || ''),
    vehicle: String(t.vehicle || ''),
    provider: String(t.provider || ''),
    cost: t.cost != null ? Number(t.cost) : null,
    notes: String(t.notes || ''),
    image: '',
  }))
}

function normaliseDays(days: unknown[]) {
  return (days as Array<Record<string, unknown>>).map(d => ({
    day: Number(d.day) || 1,
    title: String(d.title || ''),
    description: String(d.description || ''),
    activities: Array.isArray(d.activities) ? d.activities.map(String) : [],
    meals: String(d.meals || ''),
    accommodation: String(d.accommodation || ''),
    destination: String(d.destination || ''),
    weather: String(d.weather || ''),
    dressCode: String(d.dressCode || ''),
    notes: String(d.notes || ''),
  }))
}

function normalisePriceBreakdown(rows: unknown[]) {
  return (rows as Array<Record<string, unknown>>).map(r => ({
    id: uid(),
    item: String(r.label || r.item || ''),
    description: String(r.description || ''),
    cost: Number(r.cost) || 0,
  }))
}

// ─── Cover Image Map ──────────────────────────────────────────────────────────

const COVER_IMAGES: Record<string, string> = {
  dubai:       'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1600&q=90&fit=crop',
  london:      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1600&q=90&fit=crop',
  paris:       'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&q=90&fit=crop',
  maldives:    'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1600&q=90&fit=crop',
  bali:        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1600&q=90&fit=crop',
  canada:      'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=1600&q=90&fit=crop',
  'new york':  'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?w=1600&q=90&fit=crop',
  turkey:      'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1600&q=90&fit=crop',
  istanbul:    'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=1600&q=90&fit=crop',
  greece:      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1600&q=90&fit=crop',
  santorini:   'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1600&q=90&fit=crop',
  tokyo:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&q=90&fit=crop',
  japan:       'https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=1600&q=90&fit=crop',
  safari:      'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1600&q=90&fit=crop',
  zanzibar:    'https://images.unsplash.com/photo-1590512948681-ae1ded30b9cb?w=1600&q=90&fit=crop',
  marrakech:   'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=1600&q=90&fit=crop',
  singapore:   'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1600&q=90&fit=crop',
  'cape town': 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=1600&q=90&fit=crop',
  seychelles:  'https://images.unsplash.com/photo-1605451793880-db61d2e9ffc9?w=1600&q=90&fit=crop',
  honeymoon:   'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1600&q=90&fit=crop',
}

function resolveCoverImage(keyword: string): string {
  const k = keyword.toLowerCase()
  for (const [key, url] of Object.entries(COVER_IMAGES)) {
    if (k.includes(key)) return url
  }
  return 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&q=90&fit=crop'
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { prompt, itineraryId, conversationHistory, mode, currentItinerary } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Please describe the trip' }, { status: 400 })
  }

  // Build the user message based on mode
  let userMessage = ''

  if (mode === 'refine' && currentItinerary) {
    userMessage = `Current itinerary context:
${JSON.stringify(currentItinerary, null, 2).substring(0, 2000)}

Staff request: ${prompt}

Update the itinerary based on the staff member's request. Return the complete updated itinerary JSON.`
  } else if (mode === 'parse') {
    userMessage = `Parse this booking confirmation or travel information and extract all structured details:

${prompt}

Extract everything: flight numbers, PNRs, hotel confirmation numbers, dates, times, passenger names, booking references. Return as the itinerary JSON format.`
  } else {
    userMessage = `Create a complete travel itinerary for Walz Travels based on this description:

${prompt}

Generate a comprehensive, professional itinerary with all fields populated. Be specific with hotel names, restaurant names, and activities. Make it compelling and detailed.`
  }

  // Embed recent conversation history into the user message
  if (conversationHistory?.length > 0) {
    const historyText = (conversationHistory as Array<{ role: string; content: string }>)
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'STAFF' : 'JADE'}: ${m.content.substring(0, 300)}`)
      .join('\n\n')
    userMessage = `Previous conversation:\n${historyText}\n\n---\n\n${userMessage}`
  }

  let result: Record<string, unknown> | null = null

  // ── Try OpenAI GPT-4o first ──────────────────────────────────────────────
  const openAiKey = process.env.OPENAI_API_KEY
  if (openAiKey) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55000)
    try {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: JADE_COPILOT_SYSTEM },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      })
      clearTimeout(timer)
      if (openAiRes.ok) {
        const data = await openAiRes.json() as { choices: Array<{ message: { content: string } }> }
        const content = data.choices?.[0]?.message?.content
        if (content) {
          result = JSON.parse(content) as Record<string, unknown>
          result._model = 'gpt-4o'
        }
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      console.error('[copilot] OpenAI failed:', err instanceof Error ? err.message : err)
    }
  }

  // ── Fall back to Claude Sonnet ────────────────────────────────────────────
  if (!result) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55000)
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: JADE_COPILOT_SYSTEM,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })
      clearTimeout(timer)
      if (claudeRes.ok) {
        const data = await claudeRes.json() as { content: Array<{ text: string }> }
        const raw = data.content?.[0]?.text || ''
        const start = raw.indexOf('{')
        const end = raw.lastIndexOf('}')
        if (start !== -1 && end !== -1) {
          result = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
          result._model = 'claude-sonnet-4-6'
        }
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      console.error('[copilot] Claude failed:', err instanceof Error ? err.message : err)
    }
  }

  if (!result) {
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }

  // ── Auto cover image ──────────────────────────────────────────────────────
  if (!result.coverImage) {
    const keyword = String(result.coverImageKeyword || result.destination || result.title || '')
    result.coverImage = resolveCoverImage(keyword)
  }

  // ── Normalise all booking arrays ──────────────────────────────────────────
  const normedFlights    = normaliseFlights(Array.isArray(result.flights)       ? result.flights       : [])
  const normedHotels     = normaliseHotels(Array.isArray(result.hotels)         ? result.hotels        : [])
  const normedTours      = normaliseTours(Array.isArray(result.tours)           ? result.tours         : [])
  const normedTransfers  = normaliseTransfers(Array.isArray(result.transfers)   ? result.transfers     : [])
  const normedDays       = normaliseDays(Array.isArray(result.days)             ? result.days          : [])
  const normedPricing    = normalisePriceBreakdown(Array.isArray(result.priceBreakdown) ? result.priceBreakdown : [])

  // ── Save to DB if itineraryId provided ────────────────────────────────────
  if (itineraryId) {
    try {
      await prisma.itinerary.update({
        where: { id: itineraryId },
        data: {
          title:             result.title             ? String(result.title)             : undefined,
          overview:          result.overview          ? String(result.overview)          : undefined,
          destination:       result.destination       ? String(result.destination)       : undefined,
          destinations:      result.destinations      ? JSON.stringify(result.destinations) : undefined,
          startDate:         result.startDate         ? new Date(String(result.startDate))  : undefined,
          endDate:           result.endDate           ? new Date(String(result.endDate))    : undefined,
          duration:          result.duration          ? Number(result.duration)          : undefined,
          numberOfTravellers: result.numberOfTravellers ? Number(result.numberOfTravellers) : undefined,
          tripType:          result.tripType          ? String(result.tripType)          : undefined,
          currency:          result.currency          ? String(result.currency)          : undefined,
          budget:            result.totalBudget       ? Number(result.totalBudget)       : undefined,
          coverImage:        result.coverImage        ? String(result.coverImage)        : undefined,
          inclusions:        JSON.stringify(result.inclusions  || []),
          exclusions:        JSON.stringify(result.exclusions  || []),
          days:              JSON.stringify(normedDays),
          flights:           JSON.stringify(normedFlights),
          hotels:            JSON.stringify(normedHotels),
          tours:             JSON.stringify(normedTours),
          transfers:         JSON.stringify(normedTransfers),
          trains:            JSON.stringify([]),
          ferries:           JSON.stringify([]),
          priceBreakdown:    JSON.stringify(normedPricing),
          totalPrice:        result.totalPrice        ? Number(result.totalPrice)        : undefined,
          deposit:           result.deposit           ? Number(result.deposit)           : undefined,
          updatedAt:         new Date(),
        },
      })
      result._saved = true
    } catch (err: unknown) {
      console.error('[copilot] DB save failed:', err instanceof Error ? err.message : err)
      result._saved = false
    }
  }

  return NextResponse.json({
    success: true,
    itinerary: {
      ...result,
      flights:        normedFlights,
      hotels:         normedHotels,
      tours:          normedTours,
      transfers:      normedTransfers,
      days:           normedDays,
      priceBreakdown: normedPricing,
    },
    model: String(result._model || 'claude-sonnet-4-6'),
  })
}
