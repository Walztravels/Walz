// lib/jade/search-tools.ts
// Release 4B — Jade live search tools
//
// Each tool calls the underlying Walz service, creates opaque SearchResultRefs,
// and returns only customer-safe data to Jade.
//
// SECURITY INVARIANTS:
//   rateKey / offerId / supplierProductId / packageCode NEVER returned to Jade
//   supplierNetPrice / partnerNetPrice / markup NEVER returned to Jade
//   sellingPrice / currency always come from server — Jade cannot set them
//   Supplier text (hotel/activity descriptions) does NOT influence tool permissions
//
// Feature flags:
//   JADE_LIVE_SEARCH_ENABLED=true    — enables all search tools
//   JADE_TRIP_BUILDER_ENABLED=true   — enables build_trip orchestrator

import prisma from '@/lib/db'
import { searchFlights } from '@/lib/flights/duffel'
import { hotelbedsRequest }                      from '@/lib/hotelbeds'
import { ViatorActivityProvider }                from '@/lib/activities/providers/viator'
import { HotelbedsActivityProvider }             from '@/lib/activities/providers/hotelbeds'
import { fetchAllEsimPackages }                  from '@/lib/esim/api'
import { createSearchRef }                       from './search-ref'
import { trackCommercialEvent }                  from '@/lib/commercial/track'
import { calculateHotelRetailPrice }             from '@/lib/pricing/hotel'
import type { JadeTripToolContext }              from './trip-tools'
import type { JadeToolSchema }                   from './trip-tools'

// ── Hotelbeds activity provider (lazy singleton) ─────────────────────────────

let _hbActivityProvider: HotelbedsActivityProvider | null = null
function getHBActivityProvider(): HotelbedsActivityProvider {
  if (!_hbActivityProvider) _hbActivityProvider = new HotelbedsActivityProvider()
  return _hbActivityProvider
}

let _viatorProvider: ViatorActivityProvider | null = null
function getViatorProvider(): ViatorActivityProvider {
  if (!_viatorProvider) _viatorProvider = new ViatorActivityProvider()
  return _viatorProvider
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

export const JADE_SEARCH_TOOL_SCHEMAS: JadeToolSchema[] = [
  {
    name:        'search_flights',
    description: 'Search live Walz Travels flight inventory. Returns up to 5 customer-safe results with opaque result refs. Call before add_search_result_to_trip.',
    input_schema: {
      type: 'object',
      properties: {
        origin:         { type: 'string', description: 'Departure IATA code (e.g. LHR, LOS, ABV)' },
        destination:    { type: 'string', description: 'Arrival IATA code (e.g. DXB, LHR, NYC)' },
        departure_date: { type: 'string', description: 'YYYY-MM-DD' },
        return_date:    { type: 'string', description: 'YYYY-MM-DD for round trips (omit for one-way)' },
        adults:         { type: 'integer', description: 'Number of adults (≥1)', default: 1 },
        children:       { type: 'integer', description: 'Number of children (2–11)', default: 0 },
        infants:        { type: 'integer', description: 'Number of infants (<2)', default: 0 },
        cabin:          { type: 'string', enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'], default: 'ECONOMY' },
        currency:       { type: 'string', description: 'Result currency (GBP, NGN, USD, AED)', default: 'GBP' },
        direct_only:    { type: 'boolean', description: 'Filter to non-stop flights only', default: false },
      },
      required: ['origin', 'destination', 'departure_date', 'adults'],
    },
  },
  {
    name:        'search_hotels',
    description: 'Search live Walz Travels hotel inventory. Returns up to 5 customer-safe results with opaque result refs. Always search for a specific room+rate combination.',
    input_schema: {
      type: 'object',
      properties: {
        destination:  { type: 'string', description: 'Hotelbeds destination code (e.g. DXB, LON) or city name for auto-lookup' },
        check_in:     { type: 'string', description: 'YYYY-MM-DD' },
        check_out:    { type: 'string', description: 'YYYY-MM-DD' },
        adults:       { type: 'integer', description: 'Number of adults', default: 2 },
        children:     { type: 'integer', description: 'Number of children', default: 0 },
        rooms:        { type: 'integer', description: 'Number of rooms', default: 1 },
        currency:     { type: 'string', default: 'GBP' },
        min_stars:    { type: 'integer', description: 'Minimum star rating (1–5)', default: 3 },
        max_price:    { type: 'number', description: 'Maximum total price filter' },
      },
      required: ['destination', 'check_in', 'check_out', 'adults'],
    },
  },
  {
    name:        'search_activities',
    description: 'Search live Walz Travels activity inventory (experiences, tours, excursions). Returns up to 5 results. Uses Viator first, Hotelbeds as secondary.',
    input_schema: {
      type: 'object',
      properties: {
        destination:  { type: 'string', description: 'City or destination name (e.g. "Dubai", "London")' },
        date:         { type: 'string', description: 'Preferred date YYYY-MM-DD (optional)' },
        adults:       { type: 'integer', default: 2 },
        children:     { type: 'integer', default: 0 },
        infants:      { type: 'integer', default: 0 },
        interests:    { type: 'string', description: 'Preferences e.g. "adventure, desert, romantic"' },
        currency:     { type: 'string', default: 'GBP' },
        max_price:    { type: 'number', description: 'Maximum price per person filter' },
      },
      required: ['destination', 'adults'],
    },
  },
  {
    name:        'search_transfers',
    description: 'Search live Walz Travels transfer options between two locations. Returns up to 4 results.',
    input_schema: {
      type: 'object',
      properties: {
        pickup:   { type: 'string', description: 'Pickup location IATA code or name (e.g. DXB for Dubai Airport)' },
        dropoff:  { type: 'string', description: 'Drop-off location IATA code or hotel/area name' },
        date:     { type: 'string', description: 'YYYY-MM-DD' },
        time:     { type: 'string', description: 'HH:mm (24-hour)', default: '12:00' },
        adults:   { type: 'integer', default: 2 },
        children: { type: 'integer', default: 0 },
        currency: { type: 'string', default: 'GBP' },
      },
      required: ['pickup', 'dropoff', 'date', 'adults'],
    },
  },
  {
    name:        'search_esims',
    description: 'Search Walz eSIM (Jade Connect) packages for a country or region.',
    input_schema: {
      type: 'object',
      properties: {
        country:       { type: 'string', description: 'Country name or 2-letter ISO code (e.g. "UAE", "AE", "United Arab Emirates")' },
        min_data_gb:   { type: 'number', description: 'Minimum data allowance in GB' },
        validity_days: { type: 'integer', description: 'Minimum validity in days' },
        currency:      { type: 'string', default: 'USD', description: 'eSIM prices are in USD' },
      },
      required: ['country'],
    },
  },
  {
    name:        'build_trip',
    description: `Orchestrate a full trip build for the customer. Call this when the customer asks to "build", "plan", or "put together" a complete trip. After calling this tool, proceed to call search_flights → search_hotels → search_activities → search_transfers → search_esims in sequence, presenting results at each stage. Do NOT add anything automatically — always confirm with the customer before calling add_search_result_to_trip.`,
    input_schema: {
      type: 'object',
      properties: {
        trip_id:     { type: 'string', description: 'Existing trip ID to build into, or omit to create new' },
        destination: { type: 'string' },
        origin:      { type: 'string' },
        adults:      { type: 'integer', default: 1 },
        children:    { type: 'integer', default: 0 },
        infants:     { type: 'integer', default: 0 },
        start_date:  { type: 'string', description: 'YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'YYYY-MM-DD' },
        nights:      { type: 'integer', description: 'Number of nights (alternative to end_date)' },
        budget:      { type: 'number', description: 'Total budget in budget_currency' },
        budget_currency: { type: 'string', default: 'GBP' },
        preferences: { type: 'string', description: 'e.g. "direct flight, 5-star, romantic, adventure"' },
      },
      required: ['destination', 'adults'],
    },
  },
]

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeJadeSearchTool(
  name:  string,
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'search_flights':    return await execSearchFlights(input, ctx)
      case 'search_hotels':     return await execSearchHotels(input, ctx)
      case 'search_activities': return await execSearchActivities(input, ctx)
      case 'search_transfers':  return await execSearchTransfers(input, ctx)
      case 'search_esims':      return await execSearchEsims(input, ctx)
      case 'build_trip':        return await execBuildTrip(input, ctx)
      default: return JSON.stringify({ error: `Unknown search tool: ${name}` })
    }
  } catch (err) {
    console.error(`[jade-search-tools] ${name} failed:`, err)
    void trackCommercialEvent('jade_search_failed', { metadata: { tool: name, reason: (err as Error)?.message ?? 'unknown' } })
    return JSON.stringify({ error: 'Search temporarily unavailable — please try again in a moment.' })
  }
}

// ── search_flights ────────────────────────────────────────────────────────────

async function execSearchFlights(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const origin   = (input.origin        as string | undefined)?.toUpperCase()?.trim()
  const dest     = (input.destination   as string | undefined)?.toUpperCase()?.trim()
  const depDate  = input.departure_date as string | undefined
  const retDate  = input.return_date    as string | undefined
  const adults   = typeof input.adults   === 'number' ? Math.max(1, input.adults)   : 1
  const children = typeof input.children === 'number' ? Math.max(0, input.children) : 0
  const infants  = typeof input.infants  === 'number' ? Math.max(0, input.infants)  : 0
  const cabin    = (input.cabin as string | undefined) ?? 'ECONOMY'
  const directOnly = input.direct_only === true

  if (!origin || !dest || !depDate) {
    return JSON.stringify({ error: 'origin, destination, and departure_date are required' })
  }

  // Basic date validation
  const depMs = new Date(depDate).getTime()
  if (isNaN(depMs) || depMs < Date.now() - 86400_000) {
    return JSON.stringify({ error: 'departure_date must be a valid future date (YYYY-MM-DD)' })
  }
  if (adults < 1 || adults > 9) return JSON.stringify({ error: 'adults must be between 1 and 9' })
  if (children < 0 || infants < 0) return JSON.stringify({ error: 'children and infants must be non-negative' })

  const legs = [{ from: origin, to: dest, date: depDate }]
  if (retDate) legs.push({ from: dest, to: origin, date: retDate })

  const tripType = retDate ? 'round-trip' : 'one-way'

  const cabinMap: Record<string, 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'> = {
    ECONOMY: 'ECONOMY', PREMIUM_ECONOMY: 'PREMIUM_ECONOMY', BUSINESS: 'BUSINESS', FIRST: 'FIRST',
  }

  let raw
  try {
    raw = await searchFlights({
      tripType:   tripType as never,
      cabin:      cabinMap[cabin] ?? 'ECONOMY',
      passengers: { adults, children, infants },
      legs,
      directOnly,
    })
  } catch (err) {
    console.error('[jade] Duffel search error:', err)
    void trackCommercialEvent('jade_search_failed', { metadata: { productType: 'flight', reason: (err as Error)?.message ?? 'unknown' } })
    return JSON.stringify({ error: 'Flight search is temporarily unavailable.' })
  }

  if (!raw.length) {
    void trackCommercialEvent('jade_search_no_results', { metadata: { productType: 'flight', origin, destination: dest, departureDate: depDate } })
    return JSON.stringify({ ok: true, results: [], message: 'NO_RESULTS — No flights found for these parameters. Try different dates, nearby airports, or relax any filters.' })
  }

  // Filter direct-only if requested (Duffel doesn't always honour the flag)
  const postFilter = directOnly ? raw.filter(f => f.stops === 0) : raw

  // Deduplicate Duffel fare variants: same physical flight (same segments) → keep cheapest offer.
  // Grouping key: each segment's flightNumber + departureTime joined in sequence.
  const groupBest = new Map<string, typeof postFilter[0]>()
  for (const flight of postFilter) {
    const key = flight.segments.map(s => `${s.flightNumber}|${s.departureTime}`).join('::')
    const existing = groupBest.get(key)
    if (!existing || flight.price.total < existing.price.total) {
      groupBest.set(key, flight)
    }
  }
  const filtered = Array.from(groupBest.values())
  const top5 = filtered.slice(0, 5)

  // Fire CommercialEvent (non-blocking)
  trackCommercialEvent('jade_flight_search', {
    metadata: { origin, destination: dest, departureDate: depDate, adults, cabin, resultCount: top5.length, source: 'jade_chat' },
  })

  // Build customer-safe results + store refs
  const results = await Promise.all(top5.map(async (flight, i) => {
    const offerId    = flight.id   // Duffel offerId — goes into supplierPayload ONLY
    const expiresAt  = flight.expiresAt ?? undefined

    // Customer-safe details
    const outSeg   = flight.segments[0]
    const lastSeg  = flight.segments[flight.segments.length - 1]
    const retFirst = flight.returnSegments?.[0]
    const retLast  = flight.returnSegments?.[flight.returnSegments.length - 1]

    const details: Record<string, unknown> = {
      airline:       outSeg.airlineName,
      airlineCode:   outSeg.airline,
      airlineLogo:   outSeg.airlineLogo,
      origin,
      destination:   dest,
      departure:     outSeg.departureTime,
      arrival:       lastSeg.arrivalTime,
      durationMins:  flight.totalDuration,
      stops:         flight.stops,
      cabin,
      badge:         flight.badge ?? null,
      badgeLabel:    flight.badgeLabel ?? null,
    }
    if (retFirst && retLast) {
      details.returnDeparture  = retFirst.departureTime
      details.returnArrival    = retLast.arrivalTime
      details.returnDuration   = flight.returnDuration ?? null
    }
    if (flight.baggageInfo) {
      details.baggage = { cabin: flight.baggageInfo.cabin, checked: flight.baggageInfo.checked }
    }
    if (expiresAt) details.offerExpiresAt = expiresAt

    const resultRef = await createSearchRef({
      userId:      ctx.userId,
      sessionId:   ctx.sessionId,
      productType: 'FLIGHT',
      title:       `${outSeg.airlineName} ${origin}→${dest}`,
      sellingPrice: flight.price.total,
      currency:    flight.price.currency,
      details,
      supplierPayload: {
        supplier:        'DUFFEL',
        offerId,
        offerExpiresAt:  expiresAt ?? null,
        origin,
        destination:     dest,
        departureDate:   depDate,
        returnDate:      retDate ?? null,
        adults,
        children,
        infants,
        cabin,
        airline:         outSeg.airline,
        flightNumber:    outSeg.flightNumber,
        pricingCheckedAt: new Date().toISOString(),
      },
      offerExpiresAt: expiresAt,
    })

    return {
      index:        i + 1,
      resultRef,
      airline:      outSeg.airlineName,
      airlineLogo:  outSeg.airlineLogo,
      origin,
      destination:  dest,
      departure:    outSeg.departureTime,
      arrival:      lastSeg.arrivalTime,
      durationMins: flight.totalDuration,
      stops:        flight.stops,
      cabin,
      sellingPrice: flight.price.total,
      currency:     flight.price.currency,
      badge:        flight.badge ?? null,
      badgeLabel:   flight.badgeLabel ?? null,
      ...(expiresAt ? { offerExpiresAt: expiresAt } : {}),
    }
  }))

  // Server-enforced FX boundary — Jade MUST NOT convert these prices to another currency.
  // See Release 5.2.1: RULE 2 in commercial-grounding.ts.
  const resultCurrency = results[0]?.currency ?? 'GBP'
  const fxBoundary = {
    FX_CONVERSION_ALLOWED: false,
    result_currency: resultCurrency,
    note: `All prices are in ${resultCurrency}. DO_NOT_CONVERT to any other currency. Do not multiply by any exchange rate. If the customer's budget is in a different currency, keep them separate.`,
  }

  return JSON.stringify({ ok: true, productType: 'FLIGHT', count: results.length, fx_boundary: fxBoundary, results })
}

// ── Destination → Hotelbeds code helpers ─────────────────────────────────────

const HB_DEST_MAP: Record<string, string> = {
  dubai: 'DXB', uae: 'DXB', 'abu dhabi': 'AUH',
  london: 'LON', uk: 'LON', 'united kingdom': 'LON', england: 'LON',
  paris: 'PAR', france: 'PAR',
  'new york': 'NYC', usa: 'NYC', 'united states': 'NYC',
  lagos: 'LOS', nigeria: 'LOS', abuja: 'ABV',
  accra: 'ACC', ghana: 'ACC',
  nairobi: 'NBO', kenya: 'NBO',
  'cape town': 'CPT', 'south africa': 'CPT', johannesburg: 'JNB',
  toronto: 'YTO', canada: 'YTO', vancouver: 'YVR',
  amsterdam: 'AMS', netherlands: 'AMS',
  rome: 'ROM', italy: 'ROM', barcelona: 'BCN', spain: 'BCN',
  madrid: 'MAD', lisbon: 'LIS', portugal: 'LIS',
  cairo: 'CAI', egypt: 'CAI', marrakech: 'RAK', morocco: 'RAK',
  istanbul: 'IST', turkey: 'IST', bangkok: 'BKK', thailand: 'BKK',
  singapore: 'SIN', tokyo: 'TYO', japan: 'TYO', bali: 'DPS',
  maldives: 'MLE', mauritius: 'MRU', seychelles: 'SEZ',
}

function resolveHBDestCode(name: string): string {
  const lower = name.toLowerCase().trim()
  if (HB_DEST_MAP[lower]) return HB_DEST_MAP[lower]
  // Return as-is if it looks like a code already (2–3 uppercase chars)
  if (/^[A-Z]{2,3}$/.test(name)) return name
  // Partial match
  for (const [key, code] of Object.entries(HB_DEST_MAP)) {
    if (lower.includes(key)) return code
  }
  return name.toUpperCase().slice(0, 3)
}

// ── search_hotels ─────────────────────────────────────────────────────────────

async function execSearchHotels(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const destRaw  = input.destination as string | undefined
  const checkIn  = input.check_in    as string | undefined
  const checkOut = input.check_out   as string | undefined
  const adults   = typeof input.adults   === 'number' ? input.adults   : 2
  const children = typeof input.children === 'number' ? input.children : 0
  const rooms    = typeof input.rooms    === 'number' ? input.rooms    : 1
  const currency = typeof input.currency === 'string' ? input.currency : 'GBP'
  const minStars = typeof input.min_stars === 'number' ? input.min_stars : 3
  const maxPrice = typeof input.max_price === 'number' ? input.max_price : undefined

  if (!destRaw || !checkIn || !checkOut) {
    return JSON.stringify({ error: 'destination, check_in, and check_out are required' })
  }

  const destCode = resolveHBDestCode(destRaw)
  const nights   = Math.max(1, Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400_000,
  ))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    data = await hotelbedsRequest('hotel', '/hotels', {
      method: 'POST',
      body: {
        stay:        { checkIn, checkOut },
        occupancies: [{ rooms, adults, children }],
        destination: { code: destCode },
        filter:      { maxHotels: 20, minCategory: minStars, maxRatesPerRoom: 3 },
        currency,
        language:    'ENG',
        sourceMarket: 'GB',
        reviews:     [{ type: 'HOTELBEDS', maxRate: 5, minRate: 1, minReviewCount: 3 }],
        accommodations: ['HOTEL'],
      },
    })
  } catch (err) {
    console.error('[jade] Hotelbeds hotel search error:', err)
    void trackCommercialEvent('jade_search_failed', { metadata: { productType: 'hotel', reason: (err as Error)?.message ?? 'unknown' } })
    return JSON.stringify({ error: 'Hotel search is temporarily unavailable.' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawHotels: any[] = data?.hotels?.hotels ?? []
  if (!rawHotels.length) {
    void trackCommercialEvent('jade_search_no_results', { metadata: { productType: 'hotel' } })
    return JSON.stringify({ ok: true, results: [], message: 'NO_RESULTS — No hotels found. Try relaxing filters, different dates, or a nearby destination.' })
  }

  trackCommercialEvent('jade_hotel_search', {
    metadata: { destination: destCode, checkIn, checkOut, adults, resultCount: rawHotels.length, source: 'jade_chat' },
  })

  // Normalize: apply shared retail pricing and filter out hotels with invalid rates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = rawHotels.map((h: any) => {
    const rate         = h.rooms?.[0]?.rates?.[0]
    const rateKey      = rate?.rateKey ?? ''         // private — supplierPayload only
    const hotelCode    = String(h.code)
    const supplierNet  = parseFloat(rate?.net ?? h.minRate ?? '0')  // Hotelbeds partner net
    const stars        = parseInt(h.categoryCode?.replace(/\D/g, '') || '3', 10) || 3
    const review       = h.reviews?.[0]
    const policies     = rate?.cancellationPolicies ?? []
    const isRefundable = policies.length === 0 || new Date(policies[0]?.from) > new Date()
    const cancellation = isRefundable
      ? (policies[0] ? `Free cancellation until ${new Date(policies[0].from).toLocaleDateString('en-GB')}` : 'Free cancellation')
      : 'Non-refundable'

    // Shared retail pricing engine — fail-closed on zero/invalid net (requirement 12/13)
    const pricing = calculateHotelRetailPrice({ supplierNetAmount: supplierNet, currency, nights })
    return { h, hotelCode, rateKey, supplierNet, pricing, stars, review, cancellation, isRefundable, rate }
  }).filter(x => x.rateKey && x.pricing !== null)   // skip rates with missing rateKey or invalid pricing
    .sort((a, b) => a.pricing!.retailTotal - b.pricing!.retailTotal)

  let filtered = normalized
  if (maxPrice !== undefined) {
    const priceFiltered = normalized.filter(x => x.pricing!.retailTotal <= maxPrice)
    if (priceFiltered.length) filtered = priceFiltered
    // If nothing matches the price cap, return the cheapest available with a note
  }

  const top5 = filtered.slice(0, 5)

  const results = await Promise.all(top5.map(async ({ h, hotelCode, rateKey, supplierNet, pricing, stars, review, cancellation, rate }, i) => {
    const { retailTotal, retailPerNight } = pricing!

    const details: Record<string, unknown> = {
      hotelName:      h.name,
      stars,
      destination:    h.destinationName ?? destRaw,
      zone:           h.zoneName ?? null,
      roomType:       h.rooms?.[0]?.name ?? 'Standard Room',
      board:          rate?.boardName ?? 'Room Only',
      checkIn,
      checkOut,
      nights,
      pricePerNight:  retailPerNight,
      freeCancellation: cancellation,
      ...(review ? { rating: review.rate, reviewCount: review.reviewCount } : {}),
    }

    const resultRef = await createSearchRef({
      userId:      ctx.userId,
      sessionId:   ctx.sessionId,
      productType: 'HOTEL',
      title:       h.name,
      sellingPrice: retailTotal,    // Walz customer selling price — authoritative
      currency,
      details,
      supplierPayload: {
        supplier:          'HOTELBEDS',
        hotelCode,
        rateKey,           // secret — never returned to Jade
        supplierNetAmount: supplierNet,   // for reconciliation — never returned to Jade
        roomCode:          h.rooms?.[0]?.code ?? null,
        boardCode:         rate?.boardCode    ?? null,
        checkIn,
        checkOut,
        nights,
        adults,
        children,
        rooms,
        pricingCheckedAt: new Date().toISOString(),
      },
    })

    return {
      index:       i + 1,
      resultRef,
      hotelName:   h.name,
      stars,
      location:    h.zoneName ?? h.destinationName ?? destRaw,
      roomType:    h.rooms?.[0]?.name ?? 'Standard Room',
      board:       rate?.boardName ?? 'Room Only',
      checkIn,
      checkOut,
      nights,
      pricePerNight: retailPerNight,
      sellingPrice:  retailTotal,
      currency,
      freeCancellation: cancellation,
      ...(review ? { rating: review.rate, reviewCount: review.reviewCount } : {}),
    }
  }))

  return JSON.stringify({ ok: true, productType: 'HOTEL', count: results.length, checkIn, checkOut, nights, results })
}

// ── search_activities ─────────────────────────────────────────────────────────

async function execSearchActivities(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const destination = typeof input.destination === 'string' ? input.destination.trim() : ''
  const adults      = typeof input.adults      === 'number' ? input.adults      : 2
  const children    = typeof input.children    === 'number' ? input.children    : 0
  const infants     = typeof input.infants     === 'number' ? input.infants     : 0
  const currency    = typeof input.currency    === 'string' ? input.currency    : 'GBP'
  const dateFrom    = typeof input.date        === 'string' ? input.date        : undefined
  const maxPrice    = typeof input.max_price   === 'number' ? input.max_price   : undefined
  const interests   = typeof input.interests   === 'string' ? input.interests   : undefined

  if (!destination) return JSON.stringify({ error: 'destination is required' })

  const params = { destination, adults, children, infants, currency, dateFrom, keyword: interests }

  // Viator first (priority), then Hotelbeds as secondary/fallback
  let activities: import('@/lib/activities/types').NormalizedActivity[] = []

  try {
    const viatorResults = await getViatorProvider().search(params)
    activities.push(...viatorResults)
  } catch (err) {
    console.warn('[jade] Viator search failed (non-fatal):', (err as Error).message)
  }

  if (activities.length < 3) {
    try {
      const hbResults = await getHBActivityProvider().search(params)
      activities.push(...hbResults)
    } catch (err) {
      console.warn('[jade] HB activities search failed (non-fatal):', (err as Error).message)
    }
  }

  if (!activities.length) {
    void trackCommercialEvent('jade_search_no_results', { metadata: { productType: 'activity' } })
    return JSON.stringify({ ok: true, results: [], message: 'NO_RESULTS — No activities found for this destination. Try a nearby city or broaden the search.' })
  }

  trackCommercialEvent('jade_activity_search', {
    metadata: { destination, adults, currency, resultCount: activities.length, source: 'jade_chat' },
  })

  // Interest keyword filter (soft — don't exclude if interest filter leaves nothing)
  if (interests) {
    const kws = interests.toLowerCase().split(/,\s*/)
    const filtered = activities.filter(a =>
      kws.some(kw =>
        (a.title + ' ' + (a.shortDescription ?? '') + ' ' + (a.categories ?? []).join(' ')).toLowerCase().includes(kw),
      ),
    )
    if (filtered.length >= 2) activities = filtered
  }

  // Price filter
  if (maxPrice !== undefined) {
    const priceFiltered = activities.filter(a => a.sellingPrice <= maxPrice)
    if (priceFiltered.length >= 2) activities = priceFiltered
  }

  const top5 = activities.slice(0, 5)

  const results = await Promise.all(top5.map(async (act, i) => {
    const imageUrl = act.images?.[0]?.url ?? undefined

    const details: Record<string, unknown> = {
      destination,
      duration:        act.duration?.text  ?? null,
      freeCancellation: act.freeCancellation,
      cancellationPolicy: act.cancellationPolicy ?? null,
      highlights:      act.highlights?.slice(0, 3) ?? [],
      categories:      act.categories?.slice(0, 3) ?? [],
      ...(act.rating      ? { rating:      act.rating      } : {}),
      ...(act.reviewCount ? { reviewCount: act.reviewCount } : {}),
    }

    const resultRef = await createSearchRef({
      userId:      ctx.userId,
      sessionId:   ctx.sessionId,
      productType: 'ACTIVITY',
      title:       act.title,
      description: act.shortDescription ?? undefined,
      imageUrl,
      sellingPrice: act.sellingPrice,
      currency,
      details,
      supplierPayload: {
        supplier:          act.supplier,
        supplierProductId: act.supplierProductId,   // Viator productCode / HB activityCode
        travelDate:        dateFrom ?? null,
        adults,
        children,
        infants,
        pricingCheckedAt:  new Date().toISOString(),
      },
    })

    return {
      index:    i + 1,
      resultRef,
      title:    act.title,
      description: act.shortDescription ?? null,
      imageUrl: imageUrl ?? null,
      duration: act.duration?.text ?? null,
      sellingPrice: act.sellingPrice,
      currency,
      freeCancellation: act.freeCancellation,
      ...(act.rating      ? { rating:      act.rating      } : {}),
      ...(act.reviewCount ? { reviewCount: act.reviewCount } : {}),
    }
  }))

  return JSON.stringify({ ok: true, productType: 'ACTIVITY', count: results.length, results })
}

// ── search_transfers ──────────────────────────────────────────────────────────

async function execSearchTransfers(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const pickup   = (input.pickup   as string | undefined)?.trim()
  const dropoff  = (input.dropoff  as string | undefined)?.trim()
  const date     = input.date      as string | undefined
  const time     = (input.time     as string | undefined) ?? '12:00'
  const adults   = typeof input.adults   === 'number' ? input.adults   : 2
  const children = typeof input.children === 'number' ? input.children : 0

  if (!pickup || !dropoff || !date) {
    return JSON.stringify({ error: 'pickup, dropoff, and date are required' })
  }

  // Determine fromType/toType — IATA codes use 'IATA', others use 'ATLAS'
  const isIATA = (s: string) => /^[A-Z]{3}$/.test(s.toUpperCase())
  const fromCode  = pickup.toUpperCase()
  const toCode    = dropoff.toUpperCase()
  const fromType  = isIATA(fromCode) ? 'IATA' : 'ATLAS'
  const toType    = isIATA(toCode)   ? 'IATA' : 'ATLAS'
  const datetime  = `${date}T${time}:00`
  const path      = `/availability/ENG/from/${fromType}/${fromCode}/to/${toType}/${toCode}/${datetime}/${adults}/${children}/0`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    data = await hotelbedsRequest('transfers', path)
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('403') || msg.toLowerCase().includes('disallowed')) {
      return JSON.stringify({ error: 'Transfer search is currently unavailable. Please contact Walz to arrange a transfer.' })
    }
    return JSON.stringify({ error: 'Transfer search failed — please try again.' })
  }

  if (data?.errors?.length) {
    return JSON.stringify({ error: data.errors[0].message ?? 'Transfer search failed', results: [] })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: any[] = Array.isArray(data?.services) ? data.services : []
  if (!services.length) {
    void trackCommercialEvent('jade_search_no_results', { metadata: { productType: 'transfer' } })
    return JSON.stringify({ ok: true, results: [], message: 'NO_RESULTS — No transfers found between these locations.' })
  }

  trackCommercialEvent('jade_transfer_search', {
    metadata: { pickup: fromCode, dropoff: toCode, date, adults, resultCount: services.length, source: 'jade_chat' },
  })

  const top4 = services
    .filter((s: Record<string, unknown>) => parseFloat((s.price as Record<string, string>)?.totalAmount ?? '0') > 0)
    .slice(0, 4)

  const results = await Promise.all(top4.map(async (s, i) => {
    const price        = parseFloat(s.price?.totalAmount ?? '0')
    const currency     = s.price?.currency ?? 'GBP'
    const transferKey  = s.rateKey ?? s.id ?? ''   // private rateKey
    const vehicleName  = s.vehicle?.name ?? s.category?.name ?? 'Vehicle'
    const durationMins = s.travelTime ? Math.round(s.travelTime / 60) : null

    const resultRef = await createSearchRef({
      userId:      ctx.userId,
      sessionId:   ctx.sessionId,
      productType: 'TRANSFER',
      title:       `${vehicleName} — ${pickup} to ${dropoff}`,
      sellingPrice: price,
      currency,
      details: {
        vehicleType:  s.transferType ?? 'PRIVATE',
        vehicleName,
        vehicleDesc:  s.vehicle?.description ?? null,
        maxPax:       s.vehicle?.maxPax ?? null,
        pickup:       fromCode,
        dropoff:      toCode,
        date,
        time,
        durationMins,
        imageUrl:     s.vehicle?.images?.[0]?.url ?? null,
      },
      supplierPayload: {
        supplier:        'HOTELBEDS',
        transferKey,     // rateKey — never to Jade
        pickup:          fromCode,
        dropoff:         toCode,
        date,
        time,
        adults,
        children,
        pricingCheckedAt: new Date().toISOString(),
      },
    })

    return {
      index:        i + 1,
      resultRef,
      vehicleType:  s.transferType ?? 'PRIVATE',
      vehicleName,
      maxPax:       s.vehicle?.maxPax ?? null,
      pickup:       fromCode,
      dropoff:      toCode,
      durationMins,
      sellingPrice: price,
      currency,
    }
  }))

  return JSON.stringify({ ok: true, productType: 'TRANSFER', count: results.length, date, results })
}

// ── search_esims ──────────────────────────────────────────────────────────────

// Country name / ISO code → Airalo locationCode  (2-letter ISO)
const ESIM_COUNTRY_MAP: Record<string, string> = {
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE',
  'uk': 'GB', 'united kingdom': 'GB', 'england': 'GB',
  'nigeria': 'NG', 'ghana': 'GH', 'kenya': 'KE', 'south africa': 'ZA',
  'usa': 'US', 'united states': 'US', 'canada': 'CA',
  'france': 'FR', 'germany': 'DE', 'spain': 'ES', 'italy': 'IT',
  'portugal': 'PT', 'netherlands': 'NL', 'turkey': 'TR',
  'egypt': 'EG', 'morocco': 'MA', 'tanzania': 'TZ',
  'thailand': 'TH', 'singapore': 'SG', 'japan': 'JP',
  'indonesia': 'ID', 'maldives': 'MV', 'mauritius': 'MU',
}

function resolveEsimCountryCode(raw: string): string | null {
  const lower = raw.toLowerCase().trim()
  if (ESIM_COUNTRY_MAP[lower]) return ESIM_COUNTRY_MAP[lower]
  // Already 2-letter ISO?
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  for (const [key, code] of Object.entries(ESIM_COUNTRY_MAP)) {
    if (lower.includes(key)) return code
  }
  return null
}

async function execSearchEsims(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const countryRaw   = input.country     as string | undefined
  const minDataGb    = typeof input.min_data_gb    === 'number' ? input.min_data_gb    : undefined
  const validityDays = typeof input.validity_days  === 'number' ? input.validity_days  : undefined

  if (!countryRaw) return JSON.stringify({ error: 'country is required' })

  const countryCode = resolveEsimCountryCode(countryRaw)

  let packages
  try {
    packages = await fetchAllEsimPackages()
  } catch (err) {
    console.error('[jade] eSIM fetch failed:', err)
    return JSON.stringify({ error: 'eSIM search is temporarily unavailable.' })
  }

  // Filter by country
  let filtered = countryCode
    ? packages.filter(p => p.locationCode.toUpperCase() === countryCode)
    : packages.filter(p => p.locationName.toLowerCase().includes((countryRaw ?? '').toLowerCase()))

  if (!filtered.length) {
    void trackCommercialEvent('jade_search_no_results', { metadata: { productType: 'esim', country: countryRaw } })
    return JSON.stringify({ ok: true, results: [], message: `NO_RESULTS — No eSIM packages found for "${countryRaw}".` })
  }

  if (minDataGb !== undefined) {
    const byData = filtered.filter(p => (p.dataAmount ?? 0) >= minDataGb * 1000 || p.isUnlimited)
    if (byData.length) filtered = byData
  }
  if (validityDays !== undefined) {
    const byDays = filtered.filter(p => p.durationDays >= validityDays)
    if (byDays.length) filtered = byDays
  }

  trackCommercialEvent('jade_esim_search', {
    metadata: { country: countryRaw, countryCode, resultCount: filtered.length, source: 'jade_chat' },
  })

  const top5 = filtered.sort((a, b) => a.retailUsd - b.retailUsd).slice(0, 5)

  const results = await Promise.all(top5.map(async (pkg, i) => {
    const resultRef = await createSearchRef({
      userId:      ctx.userId,
      sessionId:   ctx.sessionId,
      productType: 'ESIM',
      title:       `${pkg.locationName} — ${pkg.dataLabel}`,
      sellingPrice: pkg.retailUsd,
      currency:    'USD',
      details: {
        country:      pkg.locationName,
        countryCode:  pkg.locationCode,
        packageName:  pkg.name,
        data:         pkg.dataLabel,
        validityDays: pkg.durationDays,
        speed:        pkg.speed,
        isUnlimited:  pkg.isUnlimited ?? false,
      },
      supplierPayload: {
        supplier:     'AIRALO',
        packageCode:  pkg.packageCode,   // Airalo package ID — never to Jade
        locationCode: pkg.locationCode,
        wholesaleUsd: pkg.wholesaleUsd,
        pricingCheckedAt: new Date().toISOString(),
      },
    })

    return {
      index:        i + 1,
      resultRef,
      country:      pkg.locationName,
      packageName:  pkg.name,
      data:         pkg.dataLabel,
      validityDays: pkg.durationDays,
      sellingPrice: pkg.retailUsd,
      currency:     'USD',
      speed:        pkg.speed,
      isUnlimited:  pkg.isUnlimited ?? false,
    }
  }))

  return JSON.stringify({ ok: true, productType: 'ESIM', count: results.length, results })
}

// ── build_trip ────────────────────────────────────────────────────────────────
// Orchestration signal — fires CommercialEvent and returns a structured plan
// for Jade to follow. Jade then calls individual search tools.

async function execBuildTrip(input: Record<string, unknown>, ctx: JadeTripToolContext): Promise<string> {
  const destination    = typeof input.destination     === 'string' ? input.destination  : null
  const origin         = typeof input.origin          === 'string' ? input.origin       : null
  const adults         = typeof input.adults          === 'number' ? input.adults       : 1
  const children       = typeof input.children        === 'number' ? input.children     : 0
  const budget         = typeof input.budget          === 'number' ? input.budget       : null
  const budgetCurrency = typeof input.budget_currency === 'string' ? input.budget_currency : 'GBP'
  const startDate      = typeof input.start_date      === 'string' ? input.start_date   : null
  const endDate        = typeof input.end_date        === 'string' ? input.end_date     : null
  const nights         = typeof input.nights          === 'number' ? input.nights       : null
  const preferences    = typeof input.preferences     === 'string' ? input.preferences  : null

  if (!destination) return JSON.stringify({ error: 'destination is required to build a trip' })

  // Server-authoritative CommercialEvent — non-blocking
  trackCommercialEvent('jade_trip_build_started', {
    metadata: {
      destination, origin, adults, children, budget, budgetCurrency,
      startDate, endDate, nights, preferences, source: 'jade_chat',
    },
  })

  // Resolve endDate from nights if needed
  let resolvedEndDate = endDate
  if (!resolvedEndDate && startDate && nights) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + nights)
    resolvedEndDate = d.toISOString().slice(0, 10)
  }

  return JSON.stringify({
    ok:         true,
    action:     'TRIP_BUILD_STARTED',
    destination,
    origin,
    adults,
    children,
    startDate,
    endDate:    resolvedEndDate,
    nights:     nights ?? (startDate && resolvedEndDate
      ? Math.ceil((new Date(resolvedEndDate).getTime() - new Date(startDate).getTime()) / 86400_000)
      : null),
    budget,
    budgetCurrency,
    preferences,
    instructions: [
      '1. Call search_flights with origin → destination and departure_date',
      '2. Present flight options to the customer and ask which to add',
      '3. Call search_hotels with destination, check_in, check_out',
      '4. Present hotel options to the customer and ask which to add',
      '5. Call search_activities for the destination',
      '6. Call search_transfers from arrival airport to hotel',
      '7. Call search_esims for the destination country',
      '8. Present a combined summary with running total vs budget',
      '9. After each customer selection, call add_search_result_to_trip',
      'IMPORTANT: Do NOT add anything automatically without customer confirmation.',
      budget ? `Budget constraint: ${budgetCurrency} ${budget} — track running total and warn if approaching limit.` : '',
    ].filter(Boolean),
  })
}
