import type { WalzFlight, FlightSearchInput } from '@/lib/types/flight'
import type { FlightSegmentResult, CabinClass } from '@/types/booking'

// SerpApi's getJson is loaded dynamically to avoid build-time errors
// if the package isn't installed yet in development.
type SerpApiGetJson = (params: Record<string, string | number | boolean>) => Promise<GoogleFlightsResponse>

interface GoogleFlightsResponse {
  best_flights?: GoogleFlightItinerary[]
  other_flights?: GoogleFlightItinerary[]
  error?: string
}

interface GoogleFlightItinerary {
  flights: GoogleFlightSegment[]
  total_duration: number
  carbon_emissions?: { this_flight: number }
  price: number
  type: string
  airline_logo?: string
  booking_token?: string
  layovers?: Array<{ duration: number; name: string; id: string; overnight?: boolean }>
  departure_token?: string
}

interface GoogleFlightSegment {
  departure_airport: { name: string; id: string; time: string }
  arrival_airport: { name: string; id: string; time: string }
  duration: number
  airplane?: string
  airline: string
  airline_logo?: string
  travel_class: string
  flight_number: string
  legroom?: string
  extensions?: string[]
  overnight?: boolean
  often_delayed_by_over_30_min?: boolean
}

const GOOGLE_CABIN_MAP: Record<string, CabinClass> = {
  'Economy class': 'ECONOMY',
  'Premium economy class': 'PREMIUM_ECONOMY',
  'Business class': 'BUSINESS',
  'First class': 'FIRST',
}

function mapGoogleCabin(travelClass: string): CabinClass {
  return GOOGLE_CABIN_MAP[travelClass] ?? 'ECONOMY'
}

function buildMatchKey(segment: GoogleFlightSegment, departureDate: string): string {
  // flight_number is like "BA 123" or "BA123"
  const normalized = segment.flight_number.replace(/\s+/g, '')
  return `${normalized}_${departureDate}`
}

function transformSegment(seg: GoogleFlightSegment): FlightSegmentResult {
  const parts = seg.flight_number.replace(/\s+/g, '')
  const airlineCode = parts.slice(0, 2)
  const flightNum = parts.slice(2)
  const depTime = seg.departure_airport.time // "2025-06-15 08:30"
  const arrTime = seg.arrival_airport.time

  return {
    departureAirport: seg.departure_airport.id,
    arrivalAirport: seg.arrival_airport.id,
    departureTime: depTime.replace(' ', 'T'),
    arrivalTime: arrTime.replace(' ', 'T'),
    airline: seg.airline,
    airlineCode,
    flightNumber: parts,
    duration: seg.duration,
    aircraft: seg.airplane,
    cabinClass: mapGoogleCabin(seg.travel_class),
    bookingCode: '',
  }
}

function transformItinerary(
  itinerary: GoogleFlightItinerary,
  index: number,
  adults: number,
  departureDate: string,
  currency: string
): WalzFlight {
  const outbound = itinerary.flights.map(transformSegment)
  const firstSeg = itinerary.flights[0]
  const matchKey = buildMatchKey(firstSeg, departureDate)
  const totalPassengers = adults
  const perPerson = totalPassengers > 0 ? itinerary.price / totalPassengers : itinerary.price

  const stops = itinerary.flights.length - 1

  return {
    id: `google-${index}-${Date.now()}`,
    source: 'google',
    matchKey,
    outbound,
    price: {
      amount: itinerary.price,
      currency,
      perPerson,
    },
    displayPrice: {
      amount: itinerary.price,
      currency,
      perPerson,
    },
    stops,
    totalDuration: itinerary.total_duration,
    cabinClass: (outbound[0]?.cabinClass ?? 'ECONOMY') as CabinClass,
    seatsRemaining: undefined,
    isRefundable: false,
    validatingCarrier: outbound[0]?.airlineCode ?? '',
    baggage: {
      carry: '1 x 7kg',
      checked: '1 x 23kg',
    },
  }
}

export async function searchGoogleFlights(params: FlightSearchInput): Promise<WalzFlight[]> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    console.warn('[GoogleFlights] SERPAPI_KEY not set — skipping Google Flights')
    return []
  }

  let getJson: SerpApiGetJson
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serpapi = require('serpapi') as { getJson: SerpApiGetJson }
    getJson = serpapi.getJson
  } catch {
    console.warn('[GoogleFlights] serpapi package not installed — skipping')
    return []
  }

  const cabinMap: Record<string, number> = {
    ECONOMY: 1,
    PREMIUM_ECONOMY: 2,
    BUSINESS: 3,
    FIRST: 4,
  }

  const serpParams: Record<string, string | number | boolean> = {
    engine: 'google_flights',
    api_key: apiKey,
    departure_id: params.origin ?? '',
    arrival_id: params.destination ?? '',
    outbound_date: params.departureDate ?? '',
    adults: params.adults,
    travel_class: cabinMap[params.cabinClass ?? 'ECONOMY'] ?? 1,
    currency: params.currency ?? 'GBP',
    hl: 'en',
  }

  if (params.children && params.children > 0) serpParams.children = params.children
  if (params.infants && params.infants > 0) serpParams.infants_in_seat = params.infants
  if (params.directOnly) serpParams.stops = 0
  if (params.returnDate) {
    serpParams.return_date = params.returnDate
    serpParams.type = 1 // round trip
  } else {
    serpParams.type = 2 // one way
  }

  try {
    const response = await getJson(serpParams)

    if (response.error) {
      console.error('[GoogleFlights] API error:', response.error)
      return []
    }

    const currency = params.currency ?? 'GBP'
    const adults = params.adults

    const depDate = params.departureDate ?? ''
    const bestFlights = (response.best_flights ?? []).map((it, i) =>
      transformItinerary(it, i, adults, depDate, currency)
    )
    const otherFlights = (response.other_flights ?? []).map((it, i) =>
      transformItinerary(it, bestFlights.length + i, adults, depDate, currency)
    )

    return [...bestFlights, ...otherFlights]
  } catch (err) {
    console.error('[GoogleFlights] Fetch error:', err)
    return []
  }
}
