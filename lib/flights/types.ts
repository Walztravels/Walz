export type TripType   = 'round-trip' | 'one-way' | 'multi-city'
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
export type SortOption = 'recommended' | 'cheapest' | 'fastest' | 'premium'
export type PassengerType = 'adult' | 'child' | 'infant'
export type AncillaryType = 'transfer' | 'hotel' | 'insurance' | 'esim' | 'visa' | 'lounge' | 'fast-track' | 'extra-baggage' | 'meetgreet'
export type FareType   = 'lite' | 'standard' | 'flex' | 'business' | 'first'

export interface PassengerCount {
  adults:   number
  children: number
  infants:  number
}

export interface FlightLeg {
  from: string
  to:   string
  date: string
}

export interface FlightSearchParams {
  tripType:    TripType
  cabin:       CabinClass
  passengers:  PassengerCount
  legs:        FlightLeg[]
  flexDates?:  boolean
  directOnly?: boolean
  /** Server-side stop preference: 0 = direct only, 1 = max 1 stop, 2 = max 2
   *  stops, undefined = any. Applies to EACH leg/journey independently, never
   *  to a summed total across the whole trip. */
  maxConnections?: 0 | 1 | 2
}

export interface Airport {
  iata:     string
  name:     string
  city:     string
  country:  string
  timezone: string
}

export interface FlightAmenity {
  type:      'wifi' | 'meals' | 'entertainment' | 'power' | 'lounge' | 'flatbed'
  available: boolean
  note?:     string
}

export interface FlightSegment {
  id:            string
  airline:       string
  airlineName:   string
  airlineLogo:   string
  flightNumber:  string
  aircraft:      string
  departureIata: string
  departureCity: string
  departureTime: string
  arrivalIata:   string
  arrivalCity:   string
  arrivalTime:   string
  durationMins:  number
  cabinClass:    CabinClass
  seatsRemaining?: number
  amenities:     FlightAmenity[]
}

export interface LayoverInfo {
  airport:     string
  city:        string
  durationMins: number
  overnight:   boolean
}

export interface FarePrice {
  total:     number
  base:      number
  taxes:     number
  currency:  string
  perPerson: number
}

export interface BaggageInfo {
  cabin:    string
  checked:  string
  included: boolean
}

/**
 * One leg of a trip — a round-trip has 2, a multi-city trip has N. Kept
 * alongside (not instead of) the legacy segments/returnSegments fields below
 * so existing 2-leg-only consumers (seat-map, offers, search, add-to-quote,
 * revalidate, Jade) see byte-identical output; only journeys[] carries every
 * slice of a 3+ leg multi-city offer.
 */
export interface FlightJourney {
  direction:      'outbound' | 'return' | 'leg'
  segments:       FlightSegment[]
  stops:          number
  durationMinutes: number
  layovers:       LayoverInfo[]
}

export interface FlightItinerary {
  id:              string
  segments:        FlightSegment[]     // outbound segments (= journeys[0])
  stops:           number
  totalDuration:   number
  layovers:        LayoverInfo[]
  returnSegments?: FlightSegment[]     // return leg segments (= journeys[1], round-trip only)
  returnDuration?: number
  returnLayovers?: LayoverInfo[]
  /** EVERY leg of the offer, in order. Length 1 = one-way, 2 = return or a
   *  2-leg multi-city, 3+ = multi-city. Never truncated. */
  journeys?:       FlightJourney[]
  price:           FarePrice
  fareType:        FareType
  refundable:      boolean
  changeable:      boolean
  baggageInfo:     BaggageInfo
  seatsLeft?:      number
  co2Kg?:          number
  badge?:          'recommended' | 'cheapest' | 'fastest' | 'luxury' | 'best-value'
  badgeLabel?:     string
  expiresAt?:      string             // ISO timestamp from Duffel
}

export interface FareOption {
  name:          string
  price:         number
  currency:      string
  baggage:       string
  refundable:    boolean
  changeable:    boolean
  seatSelection: 'free' | 'paid' | 'none'
  lounge:        boolean
  meals:         boolean
  highlight?:    boolean
}

export interface Ancillary {
  id:          string
  type:        AncillaryType
  name:        string
  description: string
  price:       number
  currency:    string
  icon:        string
  provider?:   string
  popular?:    boolean
  link?:       string
}

export interface Passenger {
  id:             string
  type:           PassengerType
  title:          'Mr' | 'Mrs' | 'Ms' | 'Dr'
  firstName:      string
  lastName:       string
  dob:            string
  nationality:    string
  passportNo:     string
  passportExpiry: string
  email?:         string
  phone?:         string
}

export interface PaymentSummary {
  subtotal:    number
  taxes:       number
  ancillaries: number
  discount:    number
  total:       number
  currency:    string
  method:      string
  last4?:      string
}

export interface FlightBooking {
  id:         string
  status:     'pending' | 'confirmed' | 'cancelled'
  pnr:        string
  itinerary:  FlightItinerary
  passengers: Passenger[]
  payment:    PaymentSummary
  createdAt:  string
}

export interface FilterState {
  airlines:    string[]
  stops:       number[]
  maxPrice:    number | null
  refundable:  boolean
  maxDuration: number | null
}

export interface PopularRoute {
  id:       string
  from:     string
  fromCity: string
  to:       string
  toCity:   string
  image:    string
  price:    number
  currency: string
  label?:   'Hot Deal' | 'Direct' | 'Popular' | 'New'
  dates?:   string
  tripType: TripType
}
