export type TripType   = 'round-trip' | 'one-way' | 'multi-city'
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
export type SortOption = 'recommended' | 'cheapest' | 'fastest' | 'premium'
export type PassengerType = 'adult' | 'child' | 'infant'
export type AncillaryType = 'transfer' | 'hotel' | 'insurance' | 'esim' | 'visa' | 'lounge' | 'fast-track' | 'extra-baggage'
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

export interface FlightItinerary {
  id:            string
  segments:      FlightSegment[]
  stops:         number
  totalDuration: number
  layovers:      LayoverInfo[]
  price:         FarePrice
  fareType:      FareType
  refundable:    boolean
  changeable:    boolean
  baggageInfo:   BaggageInfo
  seatsLeft?:    number
  co2Kg?:        number
  badge?:        'recommended' | 'cheapest' | 'fastest' | 'luxury' | 'best-value'
  badgeLabel?:   string
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
