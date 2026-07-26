// ComfortPass B2B Partner API — request and response shapes.
// All types are server-only; never re-export from client bundles.

// ── Passengers ─────────────────────────────────────────────────────────────────

export type CPPassengerType = 'adult' | 'child' | 'infant'

export interface CPPassenger {
  type:       CPPassengerType
  firstName:  string
  lastName:   string
}

// ── Airport search ─────────────────────────────────────────────────────────────

export interface CPAirport {
  code:    string   // IATA code e.g. "LHR"
  name:    string
  city:    string
  country: string
}

// ── Service / lounge search ────────────────────────────────────────────────────

export interface CPService {
  code:        string
  name:        string
  type:        string   // 'lounge' | 'fast_track' | 'meet_greet' | 'transfer' etc.
  airportCode: string
  terminal?:   string
  description?: string
  imageUrl?:   string
  amenities?:  string[]
}

// ── Pricing ────────────────────────────────────────────────────────────────────

export interface CPPrice {
  serviceCode: string
  amount:      number
  currency:    string
  perPerson:   boolean
  breakdown?:  CPPriceBreakdown[]
}

export interface CPPriceBreakdown {
  label:    string
  amount:   number
  currency: string
}

// ── Booking request ────────────────────────────────────────────────────────────

export interface CPBookingRequest {
  serviceCode:   string
  airportCode:   string
  date:          string   // YYYY-MM-DD
  time:          string   // HH:MM
  flightNumber:  string
  passengers:    CPPassenger[]
  paymentMethod: 'balance'   // always 'balance' — Walz handles customer payment
  reference:     string      // Walz internal reference for audit
}

// ── Booking response ───────────────────────────────────────────────────────────

export type CPBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface CPBookingResponse {
  id:            string
  bookingNumber: number
  status:        CPBookingStatus
  serviceCode:   string
  airportCode:   string
  date:          string
  time:          string
  flightNumber:  string
  passengers:    CPPassenger[]
  totalAmount:   number
  currency:      string
  checkoutUrl:   string | null   // null when paymentMethod is 'balance' — this is expected
  reference:     string
  createdAt:     string
  updatedAt:     string
}

// ── Voucher ────────────────────────────────────────────────────────────────────

export interface CPVoucher {
  bookingId:     string
  bookingNumber: number
  voucherUrl:    string
  qrCode?:       string   // base64 or data URI
  issuedAt:      string
  expiresAt?:    string
}

// ── Account balance ────────────────────────────────────────────────────────────

export interface CPBalance {
  amount:    number
  currency:  string
  updatedAt: string
}

// ── Baggage ────────────────────────────────────────────────────────────────────

// ── Baggage delivery catalogue ─────────────────────────────────────────────────
// GET /baggage/catalog — returns the full lookup tree for building a quote query.
// Not scoped to a service code; contains all countries/cities/types available.

export interface CPBaggageCatalogueEntry { id: string; name: string }
export interface CPBaggageCatalogueCity  { id: string; name: string; countryId: string }

export interface CPBaggageCatalogue {
  countries:    CPBaggageCatalogueEntry[]
  cities:       CPBaggageCatalogueCity[]
  serviceTypes: CPBaggageCatalogueEntry[]   // e.g. "Express", "Standard"
  deliveryTypes: CPBaggageCatalogueEntry[]  // e.g. "Door to door", "Terminal pickup"
}

// GET /baggage/quote — query params (not a POST body)
export interface CPBaggageQuoteRequest {
  countryId:      string
  cityId:         string
  serviceTypeId:  string
  deliveryTypeId: string
  bags:           number
}

export interface CPBaggageQuote {
  total:    number
  currency: string
  items:    { code: string; label: string; amount: number; quantity: number }[]
}

// Legacy type kept for backward compatibility in checkout route (maps to the above)
/** @deprecated Use CPBaggageQuoteRequest */
export interface CPBaggageQuoteRequestLegacy {
  serviceCode: string
  passengers:  CPPassenger[]
  baggage:     { code: string; quantity: number }[]
}

// ── Normalised Walz models (safe to pass through the stack) ───────────────────

export interface WalzAirport {
  code:    string
  name:    string
  city:    string
  country: string
}

export interface WalzService {
  code:         string
  name:         string
  type:         string
  airportCode:  string
  terminal?:    string
  description?: string
  imageUrl?:    string
  amenities?:   string[]
}

export interface WalzServicePrice {
  serviceCode:  string
  displayPrice: string   // e.g. "$45 / person"
  perPerson:    boolean
  // NOTE: raw supplier amount is intentionally omitted — never send to Jade or customer
}

export interface WalzBookingRecord {
  walzRef:       string
  cpBookingId:   string
  bookingNumber: number
  status:        CPBookingStatus
  serviceCode:   string
  airportCode:   string
  date:          string
  time:          string
  flightNumber:  string
  passengerCount: number
  // supplier amount intentionally omitted
}

export interface WalzVoucher {
  walzRef:       string
  bookingNumber: number
  voucherUrl:    string
  qrCode?:       string
}
