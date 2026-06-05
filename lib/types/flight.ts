import type { FlightResult, CabinClass } from '@/types/booking'

export type FlightSource = 'google' | 'skyscanner' | 'sabre' | 'duffel'

/**
 * WalzFlight wraps FlightResult with source metadata and a matchKey
 * used to look up inventory in Sabre before ticketing.
 *
 * matchKey format: `${airlineCode}${flightNumber}_${YYYY-MM-DD}`
 * e.g. "BA123_2025-06-15"
 */
export interface WalzFlight extends FlightResult {
  source: FlightSource
  /**
   * Canonical key to match this flight in Sabre.
   * Built from the first outbound segment's airline + flight number + departure date.
   */
  matchKey: string
  /**
   * The price shown to the user from the aggregator.
   * May differ from sabrePrice after inventory confirmation.
   */
  displayPrice: {
    amount: number
    currency: string
    perPerson: number
  }
  /** Confirmed Sabre price — populated after calling /api/flights/match */
  sabrePrice?: {
    amount: number
    currency: string
    perPerson: number
  }
  /** Whether Sabre confirmed it has bookable inventory */
  sabreBookable?: boolean
  /** Sabre solution ID returned during shop — needed to create PNR */
  sabreSolutionId?: string
  /** Duffel offer ID — required when creating a Duffel order */
  duffelOfferId?: string
  /** ISO timestamp when the Duffel offer expires */
  duffelExpiresAt?: string
  /** Cancellation penalty — null means free cancellation, undefined means not refundable */
  refundPenalty?: { amount: string; currency: string } | null
  /** Change penalty — null means free change, undefined means changes not allowed */
  changePenalty?: { amount: string; currency: string } | null
}

export interface TimeWindow {
  from: string  // "HH:MM"
  to: string    // "HH:MM"
}

export interface MultiCitySegment {
  origin: string
  destination: string
  departureDate: string
}

export interface FlightSearchInput {
  /** Trip mode — determines which fields are used */
  tripType?: 'oneway' | 'roundtrip' | 'multicity'
  /** Required for oneway / roundtrip */
  origin?: string
  /** Required for oneway / roundtrip */
  destination?: string
  /** Required for oneway / roundtrip */
  departureDate?: string
  returnDate?: string
  /** Required (and replaces origin/destination/departureDate) for multicity */
  segments?: MultiCitySegment[]
  adults: number
  children?: number
  infants?: number
  cabinClass?: CabinClass
  directOnly?: boolean
  currency?: string
  /** Optional departure time window for the outbound slice */
  departureTime?: TimeWindow
  /** Optional arrival time window for the outbound slice */
  arrivalTime?: TimeWindow
  /** Optional departure time window for the return slice */
  returnDepartureTime?: TimeWindow
  /** Optional arrival time window for the return slice */
  returnArrivalTime?: TimeWindow
}

export type SabreMatchResult =
  | { bookable: true; sabrePrice: { amount: number; currency: string; perPerson: number }; sabreSolutionId: string; priceDiffPct: number }
  | { bookable: false; reason: string }
