/**
 * Unified itinerary bookings (Research → Add to Itinerary).
 *
 * CORE INVARIANT
 *   ONE supplier flight offer = ONE itinerary flight booking = ONE commercial
 *   total price.
 *
 * Bookings are stored as JSON on the Itinerary (flights / hotels columns).
 * A unified flight is ONE row in `flights` (its `id` IS the group); its legs
 * live in `journeys[]`. The row keeps the legacy top-level fields (mirroring
 * the first segment) plus the booking-level `cost` (client total) and
 * `supplierCost` — so every existing summation site that adds `cost` per row
 * counts the booking exactly ONCE. Legacy per-leg rows (no `journeys`) are
 * never regrouped: nothing here infers grouping from route/date/airline.
 *
 * Pure module: no I/O, safe to import from client components.
 */

export type FlightTripType = 'one-way' | 'return' | 'multi-city'

export interface UnifiedSegment {
  /** IATA codes */
  from: string
  to: string
  fromCity?: string | null
  toCity?: string | null
  airline: string
  iataCode?: string | null
  flightNumber: string
  /** ISO datetimes as supplied */
  departureAt?: string | null
  arrivalAt?: string | null
  /** 'YYYY-MM-DD' / 'HH:mm' derived from the supplier times (display + legacy fields) */
  date: string
  time: string
  arrivalTime: string
  durationMinutes?: number | null
  cabin?: string | null
  baggage?: string | null
}

export interface FlightJourney {
  /** 0-based position inside the booking */
  index: number
  direction: 'outbound' | 'return' | 'leg'
  segments: UnifiedSegment[]
  durationMinutes?: number | null
  /** connections inside this journey = segments - 1 */
  stops: number
}

/**
 * What each price field means (never infer a segment price):
 *  - supplierTotal : supplier cost for the WHOLE offer (all journeys, all pax), in `currency`
 *  - taxes         : the tax/fee portion of supplierTotal when the supplier reports it
 *  - markup*       : Walz markup applied on top of supplierTotal
 *  - clientTotal   : what the client pays for the WHOLE booking, in `currency`
 * Booking-level only. There is no per-journey or per-segment price.
 */
export interface BookingPricing {
  currency: string
  supplierTotal: number
  taxes?: number | null
  markupPercent?: number | null
  markupAmount?: number | null
  clientTotal: number
  /** original supplier currency when converted into the itinerary currency */
  supplierCurrency?: string | null
  supplierTotalOriginal?: number | null
  source: 'research' | 'copilot' | 'manual'
}

/** Enough to understand the offer after it expires, and to revalidate it later. */
export interface OfferSnapshot {
  provider: 'duffel' | 'hotelbeds'
  /** flight: Duffel offer id. hotel: `${hotelCode}:${rateKey}` */
  providerOfferId: string
  searchedAt: string
  expiresAt?: string | null
  supplierCurrency: string
  supplierTotal: number
  /** search parameters (origins/destinations/dates/pax, or occupancy) */
  params?: Record<string, unknown>
  /** supplier identifiers needed for revalidation (offer/passenger ids, hotel code…) */
  refs?: Record<string, string | number | null>
}

/** Legacy per-leg fields kept on the unified row (mirror of journeys[0].segments[0]). */
export interface FlightLegacyFields {
  id: string
  from: string
  to: string
  airline: string
  iataCode: string
  flightNumber: string
  date: string
  time: string
  arrivalTime: string
  class: string
  pnr: string
  /** BOOKING-LEVEL client price — counted once */
  cost: number
  /** BOOKING-LEVEL supplier cost */
  supplierCost: number
  status: string
  notes: string
  supplierId?: string
  duffelOrderId?: string
  airlineLogoUrl?: string
  imageUrl?: string
}

export interface UnifiedFlightBooking extends FlightLegacyFields {
  bookingKind: 'unified-flight'
  tripType: FlightTripType
  journeys: FlightJourney[]
  pricing: BookingPricing
  offer?: OfferSnapshot
  passengers?: { adults: number; children: number }
  addedFrom: 'research' | 'copilot' | 'manual'
  addedAt?: string
}

export interface HotelRate {
  providerHotelCode: string
  rateKey: string
  roomCode?: string | null
  roomName: string
  boardCode?: string | null
  boardName?: string | null
  breakfastIncluded?: boolean | null
  isRefundable?: boolean | null
  cancellationPolicy?: string | null
  cancellationDeadline?: string | null
  occupancy: { rooms: number; adults: number; children: number; childAges?: number[] }
}

export interface UnifiedHotelBooking {
  id: string
  bookingKind: 'research-hotel'
  name: string
  location: string
  websiteUrl?: string
  checkIn: string
  checkOut: string
  roomType: string
  nights: number
  /** BOOKING-LEVEL client price for the whole stay — counted once */
  cost: number
  supplierCost: number
  status: string
  notes: string
  image?: string
  images?: string[]
  supplierId?: string
  stars?: number | null
  rate: HotelRate
  pricing: BookingPricing
  offer: OfferSnapshot
  addedFrom: 'research' | 'manual'
  addedAt?: string
}

// ── Type guards ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown> | null | undefined

export function isUnifiedFlight(row: Row): row is UnifiedFlightBooking & Record<string, unknown> {
  return !!row && row.bookingKind === 'unified-flight' && Array.isArray(row.journeys)
}

export function isUnifiedHotel(row: Row): row is UnifiedHotelBooking & Record<string, unknown> {
  return !!row && row.bookingKind === 'research-hotel' && !!row.rate
}

// ── Price semantics: every booking counts ONCE ──────────────────────────────

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Client total of ONE flight/hotel booking. Always the booking-level `cost`;
 * a unified booking's journeys/segments never contribute a price of their own.
 */
export function bookingClientTotal(row: Row): number {
  return row ? num(row.cost) : 0
}

export function bookingSupplierTotal(row: Row): number {
  return row ? num(row.supplierCost) : 0
}

/** Sum of client totals across booking rows (each booking once). */
export function sumClientTotals(rows: Row[] | null | undefined): number {
  return (rows ?? []).reduce((s, r) => s + bookingClientTotal(r), 0)
}

export function sumSupplierTotals(rows: Row[] | null | undefined): number {
  return (rows ?? []).reduce((s, r) => s + bookingSupplierTotal(r), 0)
}

// ── Display helpers ─────────────────────────────────────────────────────────

export function flightTripTypeLabel(t: FlightTripType): string {
  return t === 'return' ? 'Return' : t === 'multi-city' ? 'Multi-city' : 'One-way'
}

export function journeyLabel(j: FlightJourney): string {
  if (j.direction === 'outbound') return 'OUTBOUND'
  if (j.direction === 'return') return 'RETURN'
  return `LEG ${j.index + 1}`
}

/** 'LHR ⇄ DOH' | 'LHR → DOH' | 'LHR → DOH → JFK'. */
export function flightRouteLabel(b: Pick<UnifiedFlightBooking, 'tripType' | 'journeys'>): string {
  const js = b.journeys
  if (!js.length) return ''
  const first = js[0].segments[0]?.from
  const lastOfFirst = js[0].segments[js[0].segments.length - 1]?.to
  if (b.tripType === 'return') return `${first} ⇄ ${lastOfFirst}`
  if (b.tripType === 'one-way') return `${first} → ${lastOfFirst}`
  const stops = [first, ...js.map((j) => j.segments[j.segments.length - 1]?.to)]
  return stops.filter(Boolean).join(' → ')
}

// ── Duplicate protection ─────────────────────────────────────────────────────

/** Stable identity of a supplier offer already attached to an itinerary. */
export function offerDedupeKey(row: Row): string | null {
  const offer = row?.offer as { provider?: string; providerOfferId?: string } | undefined
  if (!offer?.provider || !offer.providerOfferId) return null
  return `${offer.provider}:${offer.providerOfferId}`
}

export function findRowWithOffer<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  provider: string,
  providerOfferId: string,
): T | null {
  const key = `${provider}:${providerOfferId}`
  return (rows ?? []).find((r) => offerDedupeKey(r) === key) ?? null
}

// ── Legacy safety ───────────────────────────────────────────────────────────

/**
 * Historical per-leg rows are NEVER grouped: there is no authoritative shared
 * key on them, and route/date/airline similarity is not evidence. This
 * function exists so callers state that intent explicitly.
 */
export function legacyRowsAreUnchanged<T>(rows: T[]): T[] {
  return rows
}
