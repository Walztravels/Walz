import type { WalzFlight, FlightSearchInput } from '@/lib/types/flight'
import type { FlightSegmentResult, CabinClass } from '@/types/booking'

// ─── RapidAPI Skyscanner response shapes ─────────────────────────────────────

interface SkyscannerSearchResponse {
  data?: SkyscannerData
  message?: string
}

interface SkyscannerData {
  itineraries?: SkyscannerItinerary[]
  places?: SkyscannerPlace[]
  carriers?: SkyscannerCarrier[]
}

interface SkyscannerItinerary {
  id: string
  legs: SkyscannerLeg[]
  pricingOptions: SkyscannerPricingOption[]
  score?: number
}

interface SkyscannerLeg {
  id: string
  origin: string         // place id
  destination: string    // place id
  durationInMinutes: number
  stopCount: number
  isSmallestStops: boolean
  departure: string      // ISO string
  arrival: string        // ISO string
  timeDeltaInDays: number
  carriers: { marketing: SkyscannerLegCarrier[]; operating?: SkyscannerLegCarrier[] }
  segments: SkyscannerSegment[]
}

interface SkyscannerLegCarrier {
  id: number
  name: string
  alternateId: string    // IATA code like "BA"
  logoUrl: string
}

interface SkyscannerSegment {
  id: string
  origin: { flightPlaceId: string; displayCode: string; name: string }
  destination: { flightPlaceId: string; displayCode: string; name: string }
  departure: string
  arrival: string
  durationInMinutes: number
  flightNumber: string
  marketingCarrier: { id: number; name: string; alternateId: string }
  operatingCarrier: { id: number; name: string; alternateId: string }
}

interface SkyscannerPricingOption {
  agents: SkyscannerAgent[]
  totalPrice: number
}

interface SkyscannerAgent {
  id: string
  name: string
  isCarrier: boolean
  price: number
}

interface SkyscannerPlace {
  id: string
  entityId: string
  name: string
  displayCode: string // IATA
  city?: string
  country?: string
  type: string
}

interface SkyscannerCarrier {
  id: number
  name: string
  alternateId: string
  allianceId?: number
}

// ─── Cabin class mapping ──────────────────────────────────────────────────────

const SKYSCANNER_CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premiumeconomy',
  BUSINESS: 'business',
  FIRST: 'first',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMatchKey(segment: SkyscannerSegment, departureDate: string): string {
  const flightNum = segment.flightNumber.replace(/\s+/g, '')
  return `${flightNum}_${departureDate}`
}

function transformSegment(seg: SkyscannerSegment): FlightSegmentResult {
  const airlineCode = seg.marketingCarrier.alternateId
  const flightNum = seg.flightNumber.replace(/\s+/g, '')
  const duration = seg.durationInMinutes

  return {
    departureAirport: seg.origin.displayCode,
    arrivalAirport: seg.destination.displayCode,
    departureTime: seg.departure,
    arrivalTime: seg.arrival,
    airline: seg.marketingCarrier.name,
    airlineCode,
    flightNumber: flightNum,
    duration,
    aircraft: undefined,
    cabinClass: 'ECONOMY' as CabinClass, // Skyscanner basic API doesn't expose per-segment cabin
    bookingCode: '',
  }
}

function cheapestPrice(itinerary: SkyscannerItinerary): number {
  let min = Infinity
  for (const opt of itinerary.pricingOptions) {
    if (opt.totalPrice < min) min = opt.totalPrice
  }
  return min === Infinity ? 0 : min
}

function transformItinerary(
  itinerary: SkyscannerItinerary,
  index: number,
  adults: number,
  departureDate: string,
  currency: string,
  cabinClass: CabinClass
): WalzFlight {
  const outboundLeg = itinerary.legs[0]
  const inboundLeg = itinerary.legs[1]

  const outbound = outboundLeg.segments.map(transformSegment)
  const inbound = inboundLeg ? inboundLeg.segments.map(transformSegment) : undefined

  const firstSeg = outboundLeg.segments[0]
  const matchKey = buildMatchKey(firstSeg, departureDate)

  const totalPrice = cheapestPrice(itinerary)
  const perPerson = adults > 0 ? totalPrice / adults : totalPrice

  const validatingCarrier = outboundLeg.carriers.marketing[0]?.alternateId ?? ''

  return {
    id: `skyscanner-${index}-${Date.now()}`,
    source: 'skyscanner',
    matchKey,
    outbound,
    inbound,
    price: {
      amount: totalPrice,
      currency,
      perPerson,
    },
    displayPrice: {
      amount: totalPrice,
      currency,
      perPerson,
    },
    stops: outboundLeg.stopCount,
    totalDuration: outboundLeg.durationInMinutes,
    cabinClass,
    seatsRemaining: undefined,
    isRefundable: false,
    validatingCarrier,
    baggage: {
      carry: '1 x 7kg',
      checked: '1 x 23kg',
    },
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function searchSkyscanner(params: FlightSearchInput): Promise<WalzFlight[]> {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    console.warn('[Skyscanner] RAPIDAPI_KEY not set — skipping Skyscanner')
    return []
  }

  const cabinClass = params.cabinClass ?? 'ECONOMY'

  // Skyscanner v3 via RapidAPI — create session then poll
  const createBody = {
    query: {
      market: 'UK',
      locale: 'en-GB',
      currency: params.currency ?? 'GBP',
      queryLegs: [
        {
          originPlaceId: { iata: params.origin },
          destinationPlaceId: { iata: params.destination },
          date: {
            year: parseInt((params.departureDate ?? '2000-01-01').slice(0, 4)),
            month: parseInt((params.departureDate ?? '2000-01-01').slice(5, 7)),
            day: parseInt((params.departureDate ?? '2000-01-01').slice(8, 10)),
          },
        },
        ...(params.returnDate
          ? [
              {
                originPlaceId: { iata: params.destination },
                destinationPlaceId: { iata: params.origin },
                date: {
                  year: parseInt(params.returnDate.slice(0, 4)),
                  month: parseInt(params.returnDate.slice(5, 7)),
                  day: parseInt(params.returnDate.slice(8, 10)),
                },
              },
            ]
          : []),
      ],
      adults: params.adults,
      childrenAges: params.children ? Array(params.children).fill(10) : [],
      cabinClass: SKYSCANNER_CABIN_MAP[cabinClass] ?? 'economy',
      excludedAgentsIds: [],
      excludedCarriersIds: [],
      includeSustainabilityData: false,
      nearbyAirports: false,
    },
  }

  try {
    // Step 1: Create search session
    const createRes = await fetch(
      'https://skyscanner50.p.rapidapi.com/api/v1/searchFlights',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'skyscanner50.p.rapidapi.com',
        },
        body: JSON.stringify(createBody),
      }
    )

    if (!createRes.ok) {
      console.error('[Skyscanner] Create session failed:', createRes.status)
      return []
    }

    const data = (await createRes.json()) as SkyscannerSearchResponse

    if (!data.data?.itineraries?.length) {
      return []
    }

    const currency = params.currency ?? 'GBP'
    const adults = params.adults

    return data.data.itineraries
      .slice(0, 50)
      .map((it, i) => transformItinerary(it, i, adults, params.departureDate ?? '', currency, cabinClass))
  } catch (err) {
    console.error('[Skyscanner] Error:', err)
    return []
  }
}
