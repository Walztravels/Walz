/**
 * Quote → Itinerary conversion bridge (Client Action Centre / Inbox V1,
 * Phase 2/3 — Agent C, Proposal/Commercial Lifecycle).
 *
 * ONE-WAY, ON-DEMAND mapping only. This module is a PURE function: given a
 * Quote (and its relations), it returns the field values needed for
 * `prisma.itinerary.create()`. It does not touch the database, does not
 * generate a referenceNumber (the caller — the convert route — owns
 * uniqueness), and never mutates the source Quote.
 *
 * Business context (do not re-litigate here — see the route/tests for the
 * full rationale): Quote/QuoteItem/QuoteFlightOption/QuoteHotelOption stay
 * the commercial/pricing source of truth. The GA0-GA6 Itinerary system
 * (app/itinerary/[ref]/page.tsx + _ProposalPage.tsx, its approval route,
 * lib/proposalHash.ts) stays the ONLY client-facing presentation +
 * acceptance layer for rich multi-service quotes going forward. This
 * module produces a DRAFT Itinerary only — status is always 'draft' and
 * the row is never sent to a client by this code path. Staff review and
 * edit the draft in the itinerary planner before using GA0-GA6's own Send
 * flow (app/api/admin/itineraries/[id]/send/route.ts, untouched).
 *
 * Shape source of truth: the JSON fields on Itinerary (flights/hotels/
 * tours/transfers/priceBreakdown) are read back by app/itinerary/[ref]/
 * page.tsx's Raw* types and re-exposed as ProposalFlight/ProposalHotel/
 * ProposalTour/ProposalTransfer/ProposalPriceLine (app/itinerary/[ref]/
 * _types.ts) for _ProposalPage.tsx's FlightCard/HotelCard/ProposalPricing.
 * Every field name below was taken directly from those Raw* types — not
 * guessed.
 */

import { minorToDecimal } from '@/lib/currency'
import type {
  BookingPricing,
  FlightJourney,
  FlightTripType,
  UnifiedFlightBooking,
  UnifiedSegment,
} from '@/lib/itinerary/unified-booking'
import { sumClientTotals } from '@/lib/itinerary/unified-booking'

// ── Inputs (subset of the Prisma Quote/QuoteItem/... rows we actually need) ──

export interface QuoteForConversion {
  id: string
  reference: string
  title: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  currency: string
  totalMinor: bigint
  subtotalMinor: bigint
  markupMinor: bigint
  serviceChargeMinor: bigint
  discountMinor: bigint
  depositMinor: bigint | null
  depositCurrency: string | null
  conversationId: number | null
}

export interface QuoteItemForConversion {
  type: string
  title: string
  description: string | null
  sortOrder: number
  sellingPriceMinor: bigint
  currency: string
  clientNote: string | null
  clientVisible: boolean
}

export interface QuoteFlightSegmentForConversion {
  segmentOrder: number
  originCode: string
  originCity: string | null
  destinationCode: string
  destinationCity: string | null
  departureAt: Date
  arrivalAt: Date
  flightNumber: string | null
  stops: number
  // V1.4 — Agent D (quote → itinerary conversion, unified-flight shape).
  // Optional/nullable so callers/fixtures that don't set it keep compiling;
  // Prisma's `include: { flightOptions: { include: { segments: true } } }`
  // in the convert route (untouched — not this module's file) already
  // returns the full QuoteFlightSegment row, no `select` narrowing, so this
  // is already present at runtime once the route re-reads a fresh row.
  durationMinutes?: number | null
}

export interface QuoteFlightOptionForConversion {
  airline: string
  airlineCode?: string | null
  airlineLogoUrl: string | null
  cabinClass: string
  isRecommended: boolean
  sortOrder: number
  sellingPriceMinor: bigint
  currency: string
  segments: QuoteFlightSegmentForConversion[]
  // V1.4 — Agent D: fields needed to build a UnifiedFlightBooking row (one
  // row per option, see mapFlights) instead of one legacy row per segment.
  // All optional/nullable — see the segment comment above for why this is
  // safe without a query change (full QuoteFlightOption row already flows
  // through the existing `include`).
  tripType?: string | null
  costMinor?: bigint | null
  markupMinor?: bigint | null
  supplierCostMinor?: bigint | null
  supplierCurrency?: string | null
  duffelOfferId?: string | null
  createdAt?: Date | null
  fareExpiresAt?: Date | null
}

export interface QuoteHotelOptionForConversion {
  id: string
  hotelName: string
  city: string | null
  country: string | null
  checkIn: Date
  checkOut: Date
  nights: number
  adults: number
  children: number
  roomType: string | null
  mealPlan: string | null
  isRecommended: boolean
  sortOrder: number
  sellingPriceMinor: bigint
  currency: string
}

export interface QuoteMediaForConversion {
  hotelOptionId: string | null
  flightOptionId: string | null
  url: string
  clientVisible: boolean
  isHero: boolean
  sortOrder: number
}

// ── Output — the exact fields this module sets on prisma.itinerary.create() ──
// (referenceNumber, status defaults, id, timestamps are left to the caller /
// Prisma defaults — see the module header.)

export interface ItineraryDraftFields {
  title: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  destination: string
  startDate: Date | null
  endDate: Date | null
  numberOfTravellers: number
  currency: string
  flights: string          // JSON string — RawFlight[]
  hotels: string           // JSON string — RawHotel[]
  tours: string            // JSON string — RawTour[]
  transfers: string        // JSON string — RawTransfer[]
  totalPrice: number | null
  deposit: number | null
  priceBreakdown: string   // JSON string — ProposalPriceLine[]
  coverImage: string | null
  status: 'draft'
  notes: string
  quoteId: string
  conversationId: number | null
}

// ── Raw* JSON shapes (mirrors app/itinerary/[ref]/page.tsx's Raw* types) ──
//
// Flights are the one exception: since V1.4 (Agent D), `flights` holds
// UnifiedFlightBooking rows (lib/itinerary/unified-booking.ts) — the same
// shape Research → Add to Itinerary produces — instead of one legacy
// per-segment row per QuoteFlightSegment. See mapFlights below.

interface RawHotel {
  name?: string; location?: string; checkIn?: string; checkOut?: string
  roomType?: string; nights?: number; mealPlan?: string; images?: string[]
  cost?: number | null
}
interface RawTransfer {
  type?: string; from?: string; to?: string; date?: string; vehicle?: string; images?: string[]
  cost?: number | null
}
interface RawTour {
  name?: string; location?: string; date?: string; time?: string
  duration?: string; provider?: string; notes?: string; images?: string[]
  cost?: number | null
}
interface RawPriceRow { item: string; description?: string; cost: number }

// ── Helpers ───────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
// Flight times in this codebase are stored and read as the LITERAL clock
// digits of the ISO string (local airport time, never browser-converted —
// see app/admin/quotes/[id]/page.tsx's fmtTime comment: "Flight times are
// always local airport time — extract HH:MM directly, no browser timezone
// conversion"). Segment departureAt/arrivalAt follow the same convention.
function isoTime(d: Date): string {
  return d.toISOString().slice(11, 16)
}

function money(minor: bigint, currency: string): number {
  return minorToDecimal(minor, currency)
}

/**
 * Best-effort DESTINATION fallback.
 *
 * Itinerary.destination is NON-NULLABLE (schema.prisma), but Quote has no
 * single top-level destination field — a Quote is a flat bag of priced
 * line items, not a structured trip. Priority, in order:
 *   1. First hotel option's city (+ country) — a hotel is the strongest
 *      signal of "where this trip actually goes".
 *   2. First flight option's first segment's arrival city/code — covers
 *      flight-only quotes with no hotel line.
 *   3. 'Destination TBC' — an explicit, staff-visible placeholder.
 * This is PROVISIONAL DRAFT CONTENT ONLY: the created row is always
 * status:'draft' and is never auto-sent to a client (see module header),
 * so a staff member always reviews/corrects this before Send — the same
 * safety margin the existing TripRequest→Itinerary convert route relies on
 * for its own best-effort `destination: request.destination || ''`.
 */
function deriveDestination(
  hotelOptions: QuoteHotelOptionForConversion[],
  flightOptions: QuoteFlightOptionForConversion[],
): string {
  const hotel = [...hotelOptions].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  if (hotel) {
    const parts = [hotel.city, hotel.country].filter((p): p is string => !!p && p.trim().length > 0)
    if (parts.length > 0) return parts.join(', ')
  }
  const flight = [...flightOptions].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const firstSegment = flight?.segments && [...flight.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)[0]
  if (firstSegment) {
    return firstSegment.destinationCity || firstSegment.destinationCode
  }
  return 'Destination TBC'
}

function deriveDateRange(
  hotelOptions: QuoteHotelOptionForConversion[],
  flightOptions: QuoteFlightOptionForConversion[],
): { startDate: Date | null; endDate: Date | null } {
  const dates: Date[] = []
  for (const h of hotelOptions) {
    if (h.checkIn) dates.push(h.checkIn)
    if (h.checkOut) dates.push(h.checkOut)
  }
  for (const f of flightOptions) {
    for (const s of f.segments) {
      if (s.departureAt) dates.push(s.departureAt)
      if (s.arrivalAt) dates.push(s.arrivalAt)
    }
  }
  if (dates.length === 0) return { startDate: null, endDate: null }
  const sorted = dates.slice().sort((a, b) => a.getTime() - b.getTime())
  return { startDate: sorted[0], endDate: sorted[sorted.length - 1] }
}

/** Same non-DB id convention lib/itinerary/research-add.ts's freshId() uses
 * for JSON-row (not Prisma-row) ids — this module is a pure function and
 * never touches the database, so a local generator matching that format
 * (rather than importing across the itinerary-owned file boundary) keeps
 * the two modules independently editable. */
function freshFlightRowId(): string {
  return `bk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** 'one-way'/'oneway', 'return'/'round-trip'/'roundtrip', 'multi-city'/
 * 'multicity' (case/separator-insensitive) → the FlightTripType union.
 * Anything else (including the Prisma column's bare default "roundtrip"
 * written by nothing real, or a genuinely absent value) is UNRECOGNISED. */
function normalizeTripType(raw: string | null | undefined): FlightTripType | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[\s_]/g, '-')
  if (s === 'one-way' || s === 'oneway') return 'one-way'
  if (s === 'return' || s === 'round-trip' || s === 'roundtrip') return 'return'
  if (s === 'multi-city' || s === 'multicity') return 'multi-city'
  return null
}

function sortByOrder(segs: QuoteFlightSegmentForConversion[]): QuoteFlightSegmentForConversion[] {
  return [...segs].sort((a, b) => a.segmentOrder - b.segmentOrder)
}

/**
 * Split one option's FLAT segment list (in the order it was supplied — see
 * below for why this must not be a blind global sort) into journeys/legs.
 *
 * `segmentOrder` means two different things depending on how the option
 * was created (an existing inconsistency in this codebase, not introduced
 * here): live-search imports (app/api/admin/travel-search/add-to-quote/
 * route.ts's `allSegs = [...offer.segments, ...offer.returnSegments]`,
 * built from per-journey-zero-based NormalizedFlightSegment.segmentOrder)
 * RESET to 0 at the start of every leg, while manually-entered options
 * give every segment in the option one incrementing index with no resets.
 * We detect which convention is in play from the data itself:
 *   - a repeated/non-increasing segmentOrder value anywhere in the
 *     supplied order → per-leg-reset convention → split wherever the
 *     order does not strictly increase versus the previous segment.
 *   - otherwise (strictly increasing, no repeats) → split evenly by the
 *     requested journey count, in segmentOrder order (this is the common
 *     manual-entry, direct-flights case: a 2-segment return becomes one
 *     outbound + one return segment).
 * `journeyCount` is a target for the second case only; the reset-detection
 * branch always reports the legs the data itself shows.
 */
function splitSegmentsIntoLegs(
  segments: QuoteFlightSegmentForConversion[],
  journeyCount: number,
): QuoteFlightSegmentForConversion[][] {
  if (segments.length === 0) return []
  if (journeyCount <= 1) return [sortByOrder(segments)]

  const seen = new Set<number>()
  let hasReset = false
  for (const s of segments) {
    if (seen.has(s.segmentOrder)) { hasReset = true; break }
    seen.add(s.segmentOrder)
  }

  if (hasReset) {
    const legs: QuoteFlightSegmentForConversion[][] = []
    let current: QuoteFlightSegmentForConversion[] = []
    for (const s of segments) {
      if (current.length > 0 && s.segmentOrder <= current[current.length - 1].segmentOrder) {
        legs.push(current)
        current = []
      }
      current.push(s)
    }
    if (current.length > 0) legs.push(current)
    return legs
  }

  // No reset signal: only split when segments divide EVENLY across the
  // journeys (an unambiguous case, e.g. 1-per-leg or 2-per-leg symmetric
  // connections). An uneven count (e.g. 3 segments / 2 journeys) has no
  // confident split — return everything as ONE leg so the caller's
  // `legs.length !== journeyCount` check falls back to the safe
  // single-journey representation instead of silently mislabeling which
  // segments belong to which direction.
  const sorted = sortByOrder(segments)
  if (sorted.length % journeyCount !== 0) return [sorted]
  const perLeg = sorted.length / journeyCount
  const legs: QuoteFlightSegmentForConversion[][] = []
  for (let i = 0; i < journeyCount; i++) {
    const start = i * perLeg
    const slice = sorted.slice(start, start + perLeg)
    if (slice.length > 0) legs.push(slice)
  }
  return legs
}

function toUnifiedSegment(seg: QuoteFlightSegmentForConversion, opt: QuoteFlightOptionForConversion): UnifiedSegment {
  return {
    from: seg.originCode,
    to: seg.destinationCode,
    fromCity: seg.originCity ?? null,
    toCity: seg.destinationCity ?? null,
    airline: opt.airline,
    iataCode: opt.airlineCode ?? null,
    flightNumber: seg.flightNumber ?? '',
    departureAt: seg.departureAt.toISOString(),
    arrivalAt: seg.arrivalAt.toISOString(),
    date: isoDate(seg.departureAt),
    time: isoTime(seg.departureAt),
    arrivalTime: isoTime(seg.arrivalAt),
    durationMinutes: seg.durationMinutes ?? null,
    cabin: opt.cabinClass,
    baggage: null,
  }
}

function toJourney(
  segs: QuoteFlightSegmentForConversion[],
  index: number,
  direction: FlightJourney['direction'],
  opt: QuoteFlightOptionForConversion,
): FlightJourney {
  const sorted = sortByOrder(segs)
  const segments = sorted.map(s => toUnifiedSegment(s, opt))
  const summed = segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  return {
    index,
    direction,
    segments,
    durationMinutes: summed > 0 ? summed : null,
    stops: Math.max(0, segments.length - 1),
  }
}

/**
 * Groups one option's segments into FlightJourney[] using the option's OWN
 * `tripType` — never guessed from segment order (see module report).
 *
 * FALLBACK RULE (documented, tested): when `tripType` is missing or an
 * unrecognised string, we do NOT attempt a structural split — every
 * segment goes into a single 'outbound' journey. A staff-reviewed DRAFT
 * itinerary with every segment visible under one heading is safer than a
 * confidently wrong outbound/return split, and the option's booking-level
 * price is unaffected either way (it is never attached per-segment).
 */
function groupSegmentsByTripType(
  segments: QuoteFlightSegmentForConversion[],
  opt: QuoteFlightOptionForConversion,
): { tripType: FlightTripType; journeys: FlightJourney[] } {
  if (segments.length === 0) return { tripType: 'one-way', journeys: [] }
  const kind = normalizeTripType(opt.tripType)

  if (kind === null || kind === 'one-way') {
    return { tripType: kind ?? 'one-way', journeys: [toJourney(segments, 0, 'outbound', opt)] }
  }

  if (kind === 'return') {
    const legs = splitSegmentsIntoLegs(segments, 2)
    if (legs.length !== 2) {
      // Couldn't confidently find 2 legs (malformed/short data) — keep the
      // safe single-journey fallback rather than guess a bad split.
      return { tripType: 'return', journeys: [toJourney(segments, 0, 'outbound', opt)] }
    }
    return {
      tripType: 'return',
      journeys: [toJourney(legs[0], 0, 'outbound', opt), toJourney(legs[1], 1, 'return', opt)],
    }
  }

  // multi-city — one journey per structurally-detected leg (or, absent any
  // reset signal, one segment per leg — the common case for this system).
  const legs = splitSegmentsIntoLegs(segments, segments.length)
  return { tripType: 'multi-city', journeys: legs.map((legSegs, i) => toJourney(legSegs, i, 'leg', opt)) }
}

/**
 * ONE QuoteFlightOption → ONE UnifiedFlightBooking row (never one row per
 * segment — see module report). Mirrors research-add.ts's
 * buildUnifiedFlightFromDuffelOffer field-population pattern, adapted to a
 * quote's own fields instead of a raw Duffel offer.
 */
function buildUnifiedFlightFromQuoteOption(opt: QuoteFlightOptionForConversion): UnifiedFlightBooking {
  const { tripType, journeys } = groupSegmentsByTripType(opt.segments, opt)
  const firstJourney = journeys[0]
  const lastJourney = journeys[journeys.length - 1]
  const first = firstJourney?.segments[0]
  const lastOfLast = lastJourney?.segments[lastJourney.segments.length - 1]

  const clientTotal = money(opt.sellingPriceMinor, opt.currency)
  const supplierCurrency = opt.supplierCurrency ?? opt.currency
  // Prefer the verified supplier cost (supplierCostMinor, in its own
  // currency) over the plain costMinor (already in the quote's currency)
  // — the same preference order as the QuoteItem V1.3 FX-provenance fields
  // this mirrors (see the schema comment on QuoteFlightOption).
  const supplierTotal = opt.supplierCostMinor != null
    ? money(opt.supplierCostMinor, supplierCurrency)
    : opt.costMinor != null
      ? money(opt.costMinor, opt.currency)
      : 0

  const pricing: BookingPricing = {
    currency: opt.currency,
    supplierTotal,
    markupPercent: null,
    markupAmount: opt.markupMinor != null ? money(opt.markupMinor, opt.currency) : null,
    clientTotal,
    supplierCurrency: opt.supplierCurrency ?? null,
    supplierTotalOriginal: opt.supplierCostMinor != null ? supplierTotal : null,
    source: 'quote',
  }

  const row: UnifiedFlightBooking = {
    id: freshFlightRowId(),
    bookingKind: 'unified-flight',
    tripType,
    journeys,
    from: first?.from ?? '',
    to: lastOfLast?.to ?? '',
    airline: opt.airline,
    iataCode: opt.airlineCode ?? '',
    flightNumber: first?.flightNumber ?? '',
    date: first?.date ?? '',
    time: first?.time ?? '',
    arrivalTime: lastOfLast?.arrivalTime ?? '',
    class: opt.cabinClass,
    pnr: '',
    // BOOKING-LEVEL prices, each exactly once — never split/duplicated
    // across journeys (sumClientTotals() adds `cost` once per row).
    cost: clientTotal,
    supplierCost: supplierTotal,
    status: 'Pending',
    notes: '',
    pricing,
    addedFrom: 'quote',
    ...(opt.airlineLogoUrl ? { airlineLogoUrl: opt.airlineLogoUrl } : {}),
  }

  // A manually-entered quote flight (no duffelOfferId) has no supplier
  // offer to snapshot — exactly like a manual dummy-ticket/itinerary entry
  // has none. `offer` is optional on UnifiedFlightBooking, so it is
  // omitted rather than fabricated for these rows.
  if (opt.duffelOfferId) {
    row.offer = {
      provider: 'duffel',
      providerOfferId: opt.duffelOfferId,
      searchedAt: (opt.createdAt ?? new Date()).toISOString(),
      expiresAt: opt.fareExpiresAt ? opt.fareExpiresAt.toISOString() : null,
      supplierCurrency,
      supplierTotal,
    }
  }

  return row
}

function mapFlights(flightOptions: QuoteFlightOptionForConversion[]): UnifiedFlightBooking[] {
  return [...flightOptions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(opt => buildUnifiedFlightFromQuoteOption(opt))
}

function mapHotels(
  hotelOptions: QuoteHotelOptionForConversion[],
  media: QuoteMediaForConversion[],
): RawHotel[] {
  return [...hotelOptions].sort((a, b) => a.sortOrder - b.sortOrder).map(h => {
    const images = media
      .filter(m => m.hotelOptionId === h.id && m.clientVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(m => m.url)
    const location = [h.city, h.country].filter((p): p is string => !!p && p.trim().length > 0).join(', ') || undefined
    return {
      name: h.hotelName,
      location,
      checkIn: isoDate(h.checkIn),
      checkOut: isoDate(h.checkOut),
      roomType: h.roomType ?? undefined,
      nights: h.nights,
      mealPlan: h.mealPlan ?? undefined,
      images: images.length > 0 ? images : undefined,
      cost: money(h.sellingPriceMinor, h.currency),
    }
  })
}

/**
 * QuoteItem has only a generic type/title/description/clientNote — unlike
 * flights/hotels it carries no structured from/to/vehicle/provider fields,
 * so tours/transfers map onto only the RawTour/RawTransfer fields QuoteItem
 * actually has data for. `type`/`location`/`date`/`vehicle` are left
 * undefined rather than guessed; staff fill these in during draft review
 * (see module header — this row is never auto-sent).
 */
function mapToursAndTransfers(items: QuoteItemForConversion[]): { tours: RawTour[]; transfers: RawTransfer[] } {
  const visible = items.filter(i => i.clientVisible).sort((a, b) => a.sortOrder - b.sortOrder)
  const tours: RawTour[] = visible
    .filter(i => i.type === 'activity')
    .map(i => ({
      name: i.title,
      notes: i.clientNote ?? i.description ?? undefined,
      cost: money(i.sellingPriceMinor, i.currency),
    }))
  const transfers: RawTransfer[] = visible
    .filter(i => i.type === 'transfer')
    .map(i => ({
      type: i.title,
      cost: money(i.sellingPriceMinor, i.currency),
    }))
  return { tours, transfers }
}

/**
 * priceBreakdown mirrors Quote's OWN already-computed minor-unit totals
 * (subtotal/markup/serviceCharge/discount/total) — these are the Quote's
 * source-of-truth numbers (set when staff finalized pricing), not
 * recalculated here. Zero-value rows are omitted so an unused field
 * (e.g. no service charge on this quote) doesn't render an empty "£0.00"
 * line on the draft.
 */
function mapPriceBreakdown(quote: QuoteForConversion): RawPriceRow[] {
  const rows: RawPriceRow[] = []
  if (quote.subtotalMinor > BigInt(0)) {
    rows.push({ item: 'Subtotal', cost: money(quote.subtotalMinor, quote.currency) })
  }
  if (quote.markupMinor !== BigInt(0)) {
    rows.push({ item: 'Markup', cost: money(quote.markupMinor, quote.currency) })
  }
  if (quote.serviceChargeMinor !== BigInt(0)) {
    rows.push({ item: 'Service charge', cost: money(quote.serviceChargeMinor, quote.currency) })
  }
  if (quote.discountMinor !== BigInt(0)) {
    rows.push({ item: 'Discount', cost: -money(quote.discountMinor, quote.currency) })
  }
  rows.push({ item: 'Total', cost: money(quote.totalMinor, quote.currency) })
  return rows
}

function deriveNumberOfTravellers(hotelOptions: QuoteHotelOptionForConversion[]): number {
  const hotel = [...hotelOptions].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  if (!hotel) return 1
  const n = (hotel.adults ?? 0) + (hotel.children ?? 0)
  return n > 0 ? n : 1
}

function deriveCoverImage(media: QuoteMediaForConversion[]): string | null {
  const visible = media.filter(m => m.clientVisible)
  const hero = visible.find(m => m.isHero)
  if (hero) return hero.url
  const first = [...visible].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  return first?.url ?? null
}

// ── The mapper ───────────────────────────────────────────────────────────

export function buildItineraryDraftFromQuote(
  quote: QuoteForConversion,
  items: QuoteItemForConversion[],
  flightOptions: QuoteFlightOptionForConversion[],
  hotelOptions: QuoteHotelOptionForConversion[],
  media: QuoteMediaForConversion[] = [],
): ItineraryDraftFields {
  const { startDate, endDate } = deriveDateRange(hotelOptions, flightOptions)
  const { tours, transfers } = mapToursAndTransfers(items)
  const flights = mapFlights(flightOptions)
  const hotels = mapHotels(hotelOptions, media)

  // Nice-to-have cross-check (V1.4 — see module report, item 6): confirms
  // this rewrite did not change the AGGREGATE flights total — only how
  // each option's one price is represented (one unified row instead of
  // one row per segment). This is a self-consistency check of mapFlights,
  // not a general Quote.totalMinor reconciliation: Quote.totalMinor is
  // computed (app/api/admin/quotes/route.ts) from only clientVisible
  // items + RECOMMENDED flight/hotel options, while flights/hotels here
  // include every option (recommended and alternatives) as draft rows —
  // a pre-existing, intentional mismatch this module does not change or
  // attempt to reconcile (out of scope; the itinerary planner's own
  // isTotalStale already covers staleness once a draft is opened there).
  // totalPrice below is never touched by this check.
  const flightsSellingTotal = flightOptions.reduce((s, o) => s + money(o.sellingPriceMinor, o.currency), 0)
  const flightsMappedTotal = sumClientTotals(flights as unknown as Array<Record<string, unknown>>)
  if (Math.abs(flightsMappedTotal - flightsSellingTotal) > 0.01) {
    // eslint-disable-next-line no-console -- staff-visible diagnostic only, never thrown/blocking
    console.warn(
      `[quote-to-itinerary] Quote ${quote.reference}: mapped flights total (${flightsMappedTotal}) does not match the sum of flight options' sellingPriceMinor (${flightsSellingTotal}) — a booking-level price was lost or duplicated during conversion.`,
    )
  }

  return {
    title: quote.title,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientPhone: quote.clientPhone,
    destination: deriveDestination(hotelOptions, flightOptions),
    startDate,
    endDate,
    numberOfTravellers: deriveNumberOfTravellers(hotelOptions),
    currency: quote.currency,
    flights: JSON.stringify(flights),
    hotels: JSON.stringify(hotels),
    tours: JSON.stringify(tours),
    transfers: JSON.stringify(transfers),
    totalPrice: quote.totalMinor > BigInt(0) ? money(quote.totalMinor, quote.currency) : null,
    deposit: quote.depositMinor != null ? money(quote.depositMinor, quote.depositCurrency ?? quote.currency) : null,
    priceBreakdown: JSON.stringify(mapPriceBreakdown(quote)),
    coverImage: deriveCoverImage(media),
    status: 'draft',
    notes: `Converted from Quote ${quote.reference} on ${isoDate(new Date())}.`,
    quoteId: quote.id,
    conversationId: quote.conversationId,
  }
}
