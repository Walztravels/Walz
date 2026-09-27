import type {
  FlightSearchParams, FlightItinerary, FlightJourney, FlightSegment, FlightAmenity,
  LayoverInfo, BaggageInfo, CabinClass,
} from './types'

/**
 * Classify a raw Duffel offer's slices WITHOUT truncating to 2. Only an exact
 * reverse pair (slice 1 goes back where slice 0 came from) is a return trip;
 * everything else — including an open-jaw pair or 3+ slices — is multi-city.
 * Mirrors the equivalent, independently-maintained classifier in
 * lib/itinerary/research-add.ts (a different feature's booking model); kept
 * as plain logic here rather than a shared import so this file has no
 * dependency on itinerary-specific types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyFlightTripType(slices: any[] | null | undefined): 'one-way' | 'round-trip' | 'multi-city' {
  const list = Array.isArray(slices) ? slices : []
  if (list.length <= 1) return 'one-way'
  if (list.length === 2) {
    const a = list[0], b = list[1]
    const aFrom = a?.origin?.iata_code, aTo = a?.destination?.iata_code
    const bFrom = b?.origin?.iata_code, bTo = b?.destination?.iata_code
    if (aFrom && aTo && aFrom === bTo && aTo === bFrom) return 'round-trip'
  }
  return 'multi-city'
}

const BASE = 'https://api.duffel.com'
const VER  = process.env.DUFFEL_API_VERSION ?? 'v2'

function headers() {
  return {
    'Authorization': `Bearer ${process.env.DUFFEL_ACCESS_TOKEN ?? ''}`,
    'Duffel-Version': VER,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

async function duffelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Duffel ${res.status}: ${body}`)
  }
  const json = await res.json()
  return json.data as T
}

// ── ISO 8601 duration parser ────────────────────────────────────────────────
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return 0
  return (parseInt(m[1] ?? '0') * 60) + parseInt(m[2] ?? '0')
}

// ── Map Duffel cabin to our CabinClass ────────────────────────────────────
function mapCabin(d: string): CabinClass {
  const map: Record<string, CabinClass> = {
    economy: 'ECONOMY',
    premium_economy: 'PREMIUM_ECONOMY',
    business: 'BUSINESS',
    first: 'FIRST',
  }
  return map[d?.toLowerCase()] ?? 'ECONOMY'
}

// ── Map Duffel cabin to our Duffel API cabin string ───────────────────────
function toDuffelCabin(cabin: CabinClass): string {
  const map: Record<CabinClass, string> = {
    ECONOMY: 'economy',
    PREMIUM_ECONOMY: 'premium_economy',
    BUSINESS: 'business',
    FIRST: 'first',
  }
  return map[cabin]
}

// ── Infer amenities from cabin ────────────────────────────────────────────
function inferAmenities(cabin: CabinClass): FlightAmenity[] {
  const isBiz = cabin === 'BUSINESS' || cabin === 'FIRST'
  return [
    { type: 'wifi',          available: isBiz                   },
    { type: 'meals',         available: cabin !== 'ECONOMY' || isBiz },
    { type: 'entertainment', available: true                    },
    { type: 'power',         available: true                    },
    { type: 'lounge',        available: isBiz                   },
    { type: 'flatbed',       available: isBiz                   },
  ]
}

// ── Map a single Duffel slice → segments + layovers ──────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSlice(slice: any, prefix = ''): { segments: FlightSegment[]; layovers: LayoverInfo[]; duration: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segments: FlightSegment[] = (slice.segments ?? []).map((seg: any, i: number) => {
    const carrier = seg.marketing_carrier ?? seg.operating_carrier ?? {}
    const cabin   = mapCabin(seg.passengers?.[0]?.cabin_class ?? 'economy')
    const iata    = carrier.iata_code ?? 'XX'
    return {
      id:             seg.id ?? `${prefix}seg_${i}`,
      airline:        iata,
      airlineName:    carrier.name ?? 'Unknown',
      airlineLogo:    carrier.logo_symbol_url ?? `https://pics.avs.io/200/200/${iata}.png`,
      flightNumber:   `${iata}${seg.marketing_carrier_flight_number ?? '???'}`,
      aircraft:       seg.aircraft?.name ?? 'Aircraft',
      departureIata:  seg.origin?.iata_code ?? '',
      departureCity:  seg.origin?.city?.name ?? seg.origin?.name ?? '',
      departureTime:  seg.departing_at ?? '',
      arrivalIata:    seg.destination?.iata_code ?? '',
      arrivalCity:    seg.destination?.city?.name ?? seg.destination?.name ?? '',
      arrivalTime:    seg.arriving_at ?? '',
      durationMins:   parseDuration(seg.duration ?? 'PT0M'),
      cabinClass:     cabin,
      seatsRemaining: 9,
      amenities:      inferAmenities(cabin),
    }
  })

  const layovers: LayoverInfo[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const arrTime  = new Date(segments[i].arrivalTime).getTime()
    const depTime  = new Date(segments[i + 1].departureTime).getTime()
    const diffMins = Math.round((depTime - arrTime) / 60_000)
    layovers.push({
      airport:      segments[i].arrivalIata,
      city:         segments[i].arrivalCity,
      durationMins: diffMins,
      overnight:    diffMins > 360,
    })
  }

  const duration = segments.reduce((s, seg) => s + seg.durationMins, 0)
  return { segments, layovers, duration }
}

// ── Transform a Duffel offer → our FlightItinerary ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function duffelOfferToItinerary(offer: any, paxCount: number): FlightItinerary {
  const rawSlices: any[] = Array.isArray(offer.slices) ? offer.slices : []
  const tripType = classifyFlightTripType(rawSlices)

  // Every slice, in order — never just slices[0]/[1]. journeys[0]/[1] below
  // are also what populate the legacy segments/returnSegments fields, so a
  // one-way or round-trip offer sees byte-identical output to before; only a
  // 3+ slice multi-city offer gains the journeys it used to lose.
  const journeys: FlightJourney[] = rawSlices.map((slice, i) => {
    const mapped = mapSlice(slice, `s${i}_`)
    return {
      direction: tripType === 'round-trip' ? (i === 0 ? 'outbound' : 'return') : i === 0 ? 'outbound' : tripType === 'multi-city' ? 'leg' : 'return',
      segments: mapped.segments,
      stops: Math.max(0, mapped.segments.length - 1),
      durationMinutes: mapped.duration,
      layovers: mapped.layovers,
    }
  })

  const outbound = journeys[0] ?? { segments: [], layovers: [], durationMinutes: 0 }
  const { segments } = outbound
  const layovers = outbound.layovers
  const totalDuration = outbound.durationMinutes ?? 0

  // Return slice (round-trip) — journeys[1], kept as a separate field for
  // every existing consumer that reads returnSegments/returnDuration.
  const hasReturn     = journeys.length > 1
  const returnSlice   = hasReturn ? journeys[1] : null

  const totalAmount = parseFloat(offer.total_amount ?? offer.base_amount ?? '0')
  const baseAmount  = parseFloat(offer.base_amount ?? '0')
  const taxes       = totalAmount - baseAmount

  // Baggage from first segment first passenger
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paxBag  = offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checked = paxBag.find((b: any) => b.type === 'checked')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cabinBag = paxBag.find((b: any) => b.type === 'carry_on')
  const baggageInfo: BaggageInfo = {
    cabin:    cabinBag ? `${cabinBag.quantity}× carry-on` : '1× carry-on',
    checked:  checked  ? `${checked.quantity}× 23kg`      : 'Not included',
    included: !!checked,
  }

  const firstCabin = mapCabin(offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class ?? 'economy')

  return {
    id:            offer.id,
    segments,
    stops:         segments.length - 1,
    totalDuration,
    layovers,
    ...(returnSlice ? {
      returnSegments: returnSlice.segments,
      returnDuration: returnSlice.durationMinutes,
      returnLayovers: returnSlice.layovers,
    } : {}),
    journeys,
    price: {
      total:     totalAmount,
      base:      baseAmount,
      taxes,
      currency:  offer.total_currency ?? offer.base_currency ?? 'GBP',
      perPerson: paxCount > 0 ? Math.round(totalAmount / paxCount * 100) / 100 : totalAmount,
    },
    fareType:   firstCabin === 'ECONOMY' ? 'standard' : firstCabin === 'BUSINESS' ? 'business' : firstCabin === 'FIRST' ? 'first' : 'standard',
    refundable: false,
    changeable: false,
    baggageInfo,
    expiresAt:  offer.expires_at ?? undefined,
  }
}

// ── Assign badges to a list of itineraries ──────────────────────────────
// Rules (Release 5.2.1):
//   CHEAPEST  — lowest authoritative price only; never estimated or cross-currency.
//   FASTEST   — uniquely lowest duration only; omitted when there is a tie.
//   LUXURY    — price ≥ 2.5× cheapest AND business/first cabin.
//   RECOMMENDED — NOT assigned here; requires Release 5B scoring engine.
export function assignBadges(results: FlightItinerary[]): FlightItinerary[] {
  if (!results.length) return results
  const prices    = results.map(r => r.price.total)
  const durations = results.map(r => r.totalDuration)
  const cheapestPrice   = Math.min(...prices)
  const fastestDuration = Math.min(...durations)

  // Only label "Fastest" when one result holds the minimum duration exclusively
  const fastestIsUnique = durations.filter(d => d === fastestDuration).length === 1

  let cheapestSet = false
  let fastestSet  = false

  return results.map(r => {
    const isCheapest = r.price.total === cheapestPrice && !cheapestSet
    const isFastest  = fastestIsUnique && r.totalDuration === fastestDuration && !fastestSet
    const isLuxury   = r.price.total >= cheapestPrice * 2.5 && (r.fareType === 'business' || r.fareType === 'first')

    if (isLuxury)   return { ...r, badge: 'luxury'   as const, badgeLabel: 'Business Class' }
    if (isCheapest) { cheapestSet = true; return { ...r, badge: 'cheapest' as const, badgeLabel: 'Cheapest' } }
    if (isFastest)  { fastestSet  = true; return { ...r, badge: 'fastest'  as const, badgeLabel: 'Fastest'  } }
    return { ...r, badge: undefined, badgeLabel: undefined }
  })
}

// ── Search flights ──────────────────────────────────────────────────────
export async function searchFlights(params: FlightSearchParams): Promise<FlightItinerary[]> {
  const slices = params.legs.map(leg => ({
    origin:      leg.from,
    destination: leg.to,
    departure_date: leg.date,
  }))

  const passengers: Array<{ type: string; id?: string }> = []
  let idx = 1
  for (let i = 0; i < params.passengers.adults;   i++) passengers.push({ type: 'adult',   id: `pax_${idx++}` })
  for (let i = 0; i < params.passengers.children; i++) passengers.push({ type: 'child',   id: `pax_${idx++}` })
  for (let i = 0; i < params.passengers.infants;  i++) passengers.push({ type: 'infant_without_seat', id: `pax_${idx++}` })

  const body = {
    slices,
    passengers,
    cabin_class: toDuffelCabin(params.cabin),
    return_offers: true,
    // Duffel precedent: lib/sources/duffel.ts sends the same field for its
    // directOnly case. Applies to the whole request; Duffel does not
    // guarantee it holds per-leg on a multi-city search, so it is only a
    // hint here — the authoritative filter is server-side below.
    ...(params.maxConnections !== undefined ? { max_connections: params.maxConnections } : {}),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerRequest = await duffelFetch<any>('/air/offer_requests', {
    method: 'POST',
    body: JSON.stringify({ data: body }),
  })

  const paxCount = passengers.length
  let itineraries: FlightItinerary[] = (offerRequest.offers ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((offer: any) => duffelOfferToItinerary(offer, paxCount))

  // Authoritative stop filter: EVERY journey of the offer must satisfy the
  // limit independently (never a total across the whole trip). Applied here
  // regardless of whether Duffel's own max_connections held, so a caller can
  // never receive an offer that violates the requested stop preference.
  if (params.maxConnections !== undefined) {
    const limit = params.maxConnections
    itineraries = itineraries.filter((it) => {
      const journeys: Array<{ stops: number }> = it.journeys && it.journeys.length > 0
        ? it.journeys
        : [{ stops: it.stops }, ...(it.returnSegments ? [{ stops: it.returnSegments.length - 1 }] : [])]
      return journeys.every((j) => j.stops <= limit)
    })
  }

  itineraries = itineraries.slice(0, 20)
  return assignBadges(itineraries)
}

// ── Get a single offer ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOffer(offerId: string): Promise<any> {
  return duffelFetch(`/air/offers/${offerId}?return_available_services=true`)
}

// ── Create an order ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrder(offerId: string, passengers: any[], services?: string[]): Promise<any> {
  const body = {
    type: 'instant',
    selected_offers: [offerId],
    passengers,
    payments: [{ type: 'balance', amount: undefined, currency: undefined }],
    services: (services ?? []).map(id => ({ id, quantity: 1 })),
  }
  return duffelFetch('/air/orders', { method: 'POST', body: JSON.stringify({ data: body }) })
}

// ── Seat maps ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSeatMap(offerId: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await duffelFetch<any[]>(`/air/seat_maps?offer_id=${offerId}`)
  return Array.isArray(data) ? data : [data]
}
