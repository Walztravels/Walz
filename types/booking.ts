// Booking and search result TypeScript interfaces

export interface Airport {
  code: string
  city: string
  country: string
  name: string
}

export interface FlightSegmentResult {
  departureAirport: string
  arrivalAirport: string
  departureTime: string
  arrivalTime: string
  airline: string
  airlineCode: string
  flightNumber: string
  duration: number
  aircraft?: string
  cabinClass: string
  bookingCode: string
}

export interface FlightResult {
  id: string
  tripType?: 'oneway' | 'roundtrip' | 'multicity'
  outbound: FlightSegmentResult[]
  inbound?: FlightSegmentResult[]
  /** For multi-city: array of slices, each slice is an array of segments */
  multiCitySlices?: FlightSegmentResult[][]
  price: {
    amount: number
    currency: string
    perPerson: number
  }
  stops: number
  totalDuration: number
  cabinClass: CabinClass
  seatsRemaining?: number
  isRefundable: boolean
  baggage?: {
    checked: string
    carry: string
  }
  validatingCarrier: string
}

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'

export interface HotelAmenity {
  code: string
  description: string
}

export interface HotelResult {
  id: string
  rateKey: string
  hotelCode: string
  chainCode: string
  name: string
  address: {
    lines: string[]
    city: string
    country: string
    postcode?: string
  }
  stars: number
  pricePerNight: {
    amount: number
    currency: string
  }
  totalPrice: {
    amount: number
    currency: string
  }
  amenities: HotelAmenity[]
  images: string[]
  rating?: number
  reviewCount?: number
  isRefundable: boolean
  roomType?: string
  mealPlan?: string
  cancellationPolicy?: string
  rateCommentsId?: string
  hotelAddress?: string
  destinationTimezone?: string
}

export interface BookingPassenger {
  type: 'ADT' | 'CHD' | 'INF'
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: 'M' | 'F'
  passportNumber: string
  passportExpiry: string
  nationality: string
  email?: string
  phone?: string
}

export type BookingStep = 'passengers' | 'addons' | 'payment' | 'confirmation'

export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'

export type BookingType = 'FLIGHT' | 'HOTEL' | 'PACKAGE'

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export interface BookingAddon {
  type: 'EXTRA_BAGGAGE' | 'TRAVEL_INSURANCE' | 'SEAT_SELECTION' | 'AIRPORT_TRANSFER'
  description: string
  price: number
  currency: string
  selected: boolean
}

export interface BookingState {
  step: BookingStep
  flightResult?: FlightResult
  hotelResult?: HotelResult
  passengers: BookingPassenger[]
  addons: BookingAddon[]
  totalPrice: number
  currency: string
  contactEmail: string
  contactPhone: string
  paymentIntentId?: string
  clientSecret?: string
  pnr?: string
  bookingReference?: string
  paymentStatus: PaymentStatus
}

export interface VisaApplicationData {
  country: string
  visaType: string
  travelDate: string
  returnDate: string
  passportNumber: string
  passportExpiry: string
  nationality: string
  purpose: string
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string
  phone: string
  hasOnwardTicket: boolean
  hasAccommodation: boolean
  previousVisaRefusal: boolean
  additionalInfo?: string
}

export interface TourEnquiryData {
  tourName: string
  tourDate: string
  groupSize: number
  firstName: string
  lastName: string
  email: string
  phone: string
  specialRequirements?: string
  preferredPickupLocation?: string
}

export interface SearchFilters {
  priceMin?: number
  priceMax?: number
  airlines?: string[]
  stops?: number[]
  departureTimes?: ('morning' | 'afternoon' | 'evening' | 'night')[]
  cabinClass?: CabinClass[]
  starRating?: number[]
  amenities?: string[]
}

export type SortOption =
  | 'price_asc'
  | 'price_desc'
  | 'duration_asc'
  | 'departure_asc'
  | 'departure_desc'
  | 'rating_desc'
