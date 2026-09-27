// Normalized internal types for admin live travel search.
// These are server-side only — never returned to public quote endpoints.

export interface NormalizedFlightSegment {
  segmentOrder:     number
  originCode:       string
  originCity:       string | null
  originTerminal:   string | null
  destinationCode:  string
  destinationCity:  string | null
  destinationTerminal: string | null
  departureAt:      string  // ISO
  arrivalAt:        string  // ISO
  flightNumber:     string | null
  operatingCarrier: string | null
  marketingCarrier: string | null
  aircraft:         string | null
  durationMinutes:  number | null
  stops:            number
  layoverMinutes:   number | null
}

export interface NormalizedFlightOffer {
  provider:          'duffel'
  providerOfferId:   string        // Duffel offer ID — internal only
  searchedAt:        string        // ISO

  // Identity
  airline:           string
  airlineCode:       string | null
  tripType:          'one-way' | 'round-trip' | 'multi-city'
  cabinClass:        string

  // Supplier pricing (internal — never sent to client)
  supplierCurrency:      string
  supplierTotalAmount:   number    // decimal e.g. 1785.50
  supplierTotalMinor:    number    // integer minor units e.g. 178550

  // Offer validity
  offerExpiresAt:    string | null

  // Fare conditions
  isRefundable:      boolean
  isChangeable:      boolean
  changeFee:         string | null
  noShowRule:        string | null
  fareClass:         string | null
  fareFamily:        string | null

  // Baggage
  personalItem:      string | null
  cabinBaggage:      string | null
  checkedBaggage:    string | null
  checkedPieces:     number | null
  checkedWeight:     string | null

  // Seats
  seatIncluded:      boolean
  mealIncluded:      boolean
  seatsLeft:         number | null

  // Segments (outbound) — for a multi-city offer this is journeys[0] only.
  segments:          NormalizedFlightSegment[]
  // Return leg (round-trip) — for a multi-city offer this is journeys[1] only.
  returnSegments:    NormalizedFlightSegment[]
  /** EVERY journey of the offer, in order and never truncated. Length 1 =
   *  one-way, 2 = round-trip (exact reverse pair) or a 2-leg multi-city,
   *  3+ = multi-city. Each journey's `stops` is independent of the others —
   *  never a total across the whole trip. */
  journeys:          NormalizedFlightJourney[]
}

export interface NormalizedFlightJourney {
  direction:        'outbound' | 'return' | 'leg'
  segments:          NormalizedFlightSegment[]
  stops:             number
  durationMinutes:   number | null
}

export interface NormalizedHotelRate {
  rateKey:           string        // Hotelbeds rate key for checkrate + booking
  roomCode:          string | null
  roomName:          string | null
  boardCode:         string | null
  boardName:         string | null
  mealPlan:          string | null
  breakfastIncluded: boolean
  isRefundable:      boolean
  cancellationPolicy: string | null
  cancellationDeadline: string | null

  // Supplier pricing (internal)
  supplierCurrency:  string
  supplierAmount:    number
  supplierAmountMinor: number

  // Display pricing (per night)
  perNightAmount:    number | null
  nights:            number
}

export interface NormalizedHotelOffer {
  provider:            'hotelbeds'
  providerHotelCode:   string

  // Identity
  hotelName:           string
  starRating:          number | null
  destinationCode:     string
  destinationName:     string | null
  city:                string | null
  country:             string | null
  latitude:            string | null
  longitude:           string | null

  // Stay
  checkIn:             string
  checkOut:            string
  nights:              number
  rooms:               number
  adults:              number
  children:            number

  // Images
  imageUrls:           string[]

  // All rate options for this hotel
  rates:               NormalizedHotelRate[]

  // Convenience — cheapest rate's supplier price
  supplierCurrency:    string
  supplierMinAmount:   number
  supplierMinAmountMinor: number
}

export interface NormalizedActivityOffer {
  provider:              'hotelbeds' | 'viator'
  providerCode:          string
  providerModalityCode:  string
  providerModalityName:  string

  name:                  string
  description:           string | null
  imageUrl:              string | null
  duration:              string | null
  destinationCode:       string

  // Supplier pricing
  supplierCurrency:      string
  supplierAmount:        number
  supplierAmountMinor:   number
}

export interface NormalizedTransferOffer {
  provider:              'hotelbeds'
  providerRateKey:       string
  providerContent:       string | null

  name:                  string
  transferType:          string    // e.g. PRIVATE, SHARED
  category:              string | null
  capacity:              number | null
  vehicle:               string | null

  pickupType:            string
  pickupCode:            string
  dropoffType:           string
  dropoffCode:           string
  transferDate:          string

  // Supplier pricing
  supplierCurrency:      string
  supplierAmount:        number
  supplierAmountMinor:   number
}

// Payload accepted by POST /api/admin/travel-search/add-to-quote
export type AddToQuotePayload =
  | AddFlightToQuotePayload
  | AddHotelToQuotePayload
  | AddActivityToQuotePayload
  | AddTransferToQuotePayload

export interface AddFlightToQuotePayload {
  type:           'flight'
  quoteId:        string
  offer:          NormalizedFlightOffer
  isRecommended?: boolean
  label?:         string
  clientNote?:    string
  internalNote?:  string
  // Pricing
  costMinor:      number    // = supplierTotalMinor (staff confirms)
  markupMinor:    number
  serviceFeeMinor: number
  sellingPriceMinor: number
  currency:       string
}

export interface AddHotelToQuotePayload {
  type:           'hotel'
  quoteId:        string
  offer:          NormalizedHotelOffer
  selectedRateKey: string
  isRecommended?: boolean
  label?:         string
  clientNote?:    string
  internalNote?:  string
  // Pricing
  costMinor:      number
  markupMinor:    number
  serviceFeeMinor: number
  sellingPriceMinor: number
  currency:       string
}

export interface AddActivityToQuotePayload {
  type:           'activity'
  quoteId:        string
  offer:          NormalizedActivityOffer
  clientNote?:    string
  internalNote?:  string
  // Pricing
  costMinor:      number
  markupMinor:    number
  serviceFeeMinor: number
  sellingPriceMinor: number
  currency:       string
}

export interface AddTransferToQuotePayload {
  type:           'transfer'
  quoteId:        string
  offer:          NormalizedTransferOffer
  clientNote?:    string
  internalNote?:  string
  // Pricing
  costMinor:      number
  markupMinor:    number
  serviceFeeMinor: number
  sellingPriceMinor: number
  currency:       string
}
