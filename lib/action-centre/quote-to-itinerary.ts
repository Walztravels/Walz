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
}

export interface QuoteFlightOptionForConversion {
  airline: string
  airlineLogoUrl: string | null
  cabinClass: string
  isRecommended: boolean
  sortOrder: number
  sellingPriceMinor: bigint
  currency: string
  segments: QuoteFlightSegmentForConversion[]
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

interface RawFlight {
  from?: string; to?: string; fromCity?: string; toCity?: string
  airline?: string; flightNumber?: string; date?: string
  departureTime?: string; arrivalTime?: string
  class?: string; stops?: number
  airlineLogoUrl?: string
  cost?: number | null
}
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

function mapFlights(flightOptions: QuoteFlightOptionForConversion[]): RawFlight[] {
  const out: RawFlight[] = []
  for (const opt of [...flightOptions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const segments = [...opt.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)
    segments.forEach((seg, i) => {
      out.push({
        from: seg.originCode,
        to: seg.destinationCode,
        fromCity: seg.originCity ?? undefined,
        toCity: seg.destinationCity ?? undefined,
        airline: opt.airline,
        flightNumber: seg.flightNumber ?? undefined,
        date: isoDate(seg.departureAt),
        departureTime: isoTime(seg.departureAt),
        arrivalTime: isoTime(seg.arrivalAt),
        class: opt.cabinClass,
        stops: seg.stops,
        airlineLogoUrl: opt.airlineLogoUrl ?? undefined,
        // The flight OPTION carries one selling price for the whole
        // journey (which may span several segments, e.g. outbound +
        // return, or a connection). Attaching it to every segment would
        // double-count in the proposal page's componentPrices sum
        // (app/itinerary/[ref]/page.tsx's _sumClientPrice adds every
        // flights[].cost) — so only the FIRST segment of each option
        // carries the price.
        cost: i === 0 ? money(opt.sellingPriceMinor, opt.currency) : undefined,
      })
    })
  }
  return out
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
    flights: JSON.stringify(mapFlights(flightOptions)),
    hotels: JSON.stringify(mapHotels(hotelOptions, media)),
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
