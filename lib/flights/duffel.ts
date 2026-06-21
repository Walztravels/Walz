import type {
  FlightSearchParams, FlightItinerary, FlightSegment, FlightAmenity,
  LayoverInfo, BaggageInfo, CabinClass,
} from './types'

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

// ── Transform a Duffel offer → our FlightItinerary ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function duffelOfferToItinerary(offer: any, paxCount: number): FlightItinerary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = offer.slices[0] as any
  const segments: FlightSegment[] = (slice.segments ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (seg: any, i: number) => {
      const carrier = seg.marketing_carrier ?? seg.operating_carrier ?? {}
      const cabin   = mapCabin(seg.passengers?.[0]?.cabin_class ?? 'economy')
      return {
        id:            seg.id ?? `seg_${i}`,
        airline:       carrier.iata_code ?? 'XX',
        airlineName:   carrier.name ?? 'Unknown',
        airlineLogo:   carrier.logo_symbol_url ?? `/images/airlines/${(carrier.iata_code ?? 'xx').toLowerCase()}.png`,
        flightNumber:  `${carrier.iata_code ?? 'XX'}${seg.marketing_carrier_flight_number ?? '???'}`,
        aircraft:      seg.aircraft?.name ?? 'Aircraft',
        departureIata: seg.origin?.iata_code ?? '',
        departureCity: seg.origin?.city?.name ?? seg.origin?.name ?? '',
        departureTime: seg.departing_at ?? '',
        arrivalIata:   seg.destination?.iata_code ?? '',
        arrivalCity:   seg.destination?.city?.name ?? seg.destination?.name ?? '',
        arrivalTime:   seg.arriving_at ?? '',
        durationMins:  parseDuration(seg.duration ?? 'PT0M'),
        cabinClass:    cabin,
        seatsRemaining: typeof seg.passengers?.[0]?.cabin_class_marketing_name === 'string' ? 9 : 9,
        amenities:     inferAmenities(cabin),
      }
    }
  )

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

  const totalDuration = segments.reduce((s, seg) => s + seg.durationMins, 0)
  const totalAmount   = parseFloat(offer.total_amount ?? offer.base_amount ?? '0')
  const baseAmount    = parseFloat(offer.base_amount ?? '0')
  const taxes         = totalAmount - baseAmount

  // Baggage from first segment first passenger
  const paxBag = offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checked = paxBag.find((b: any) => b.type === 'checked')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cabin   = paxBag.find((b: any) => b.type === 'carry_on')
  const baggageInfo: BaggageInfo = {
    cabin:    cabin ? `${cabin.quantity}× carry-on` : '1× carry-on',
    checked:  checked ? `${checked.quantity}× 23kg` : 'Not included',
    included: !!checked,
  }

  const firstCabin = mapCabin(offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class ?? 'economy')

  return {
    id:            offer.id,
    segments,
    stops:         segments.length - 1,
    totalDuration,
    layovers,
    price: {
      total:     totalAmount,
      base:      baseAmount,
      taxes,
      currency:  offer.total_currency ?? offer.base_currency ?? 'GBP',
      perPerson: paxCount > 0 ? Math.round(totalAmount / paxCount * 100) / 100 : totalAmount,
    },
    fareType:    firstCabin === 'ECONOMY' ? 'standard' : firstCabin === 'BUSINESS' ? 'business' : firstCabin === 'FIRST' ? 'first' : 'standard',
    refundable:  false,
    changeable:  false,
    baggageInfo,
    seatsLeft:   offer.available_services?.length ? undefined : undefined,
    co2Kg:       offer.conditions?.change_before_departure ? undefined : undefined,
  }
}

// ── Assign badges to a list of itineraries ──────────────────────────────
export function assignBadges(results: FlightItinerary[]): FlightItinerary[] {
  if (!results.length) return results
  const prices    = results.map(r => r.price.total)
  const durations = results.map(r => r.totalDuration)
  const cheapestPrice  = Math.min(...prices)
  const fastestDuration = Math.min(...durations)

  let recommendedSet = false
  let cheapestSet    = false
  let fastestSet     = false

  return results.map(r => {
    const isCheapest = r.price.total === cheapestPrice && !cheapestSet
    const isFastest  = r.totalDuration === fastestDuration && !fastestSet
    const isLuxury   = r.price.total >= cheapestPrice * 2.5 && (r.fareType === 'business' || r.fareType === 'first')

    if (isLuxury) return { ...r, badge: 'luxury', badgeLabel: 'Business Class' }
    if (isCheapest) { cheapestSet = true; return { ...r, badge: 'cheapest', badgeLabel: 'Cheapest' } }
    if (isFastest)  { fastestSet  = true; return { ...r, badge: 'fastest',  badgeLabel: 'Fastest'  } }
    if (!recommendedSet) { recommendedSet = true; return { ...r, badge: 'recommended', badgeLabel: 'Recommended' } }
    return r
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
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerRequest = await duffelFetch<any>('/air/offer_requests', {
    method: 'POST',
    body: JSON.stringify({ data: body }),
  })

  const paxCount = passengers.length
  const itineraries = (offerRequest.offers ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((offer: any) => duffelOfferToItinerary(offer, paxCount))
    .slice(0, 20)

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
