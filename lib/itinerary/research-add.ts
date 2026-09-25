/**
 * Research → Add to Itinerary: server-side builders.
 *
 * Everything here runs server-side on data fetched FROM THE SUPPLIER by the
 * route (Duffel getOffer / Hotelbeds checkrates). Nothing is taken from the
 * browser except identifiers. Persist-only: no supplier booking is made.
 *
 * INVARIANT: one supplier offer = one booking row = one price. The offer total
 * is never split or multiplied across journeys/segments.
 */
import { calculateBookingPrice, defaultMarkupPercent } from '@/lib/pricing/booking-price'
import { convertSupplierAmount } from '@/lib/pricing/fx-convert'
import type {
  BookingPricing,
  FlightJourney,
  FlightTripType,
  HotelRate,
  UnifiedFlightBooking,
  UnifiedHotelBooking,
  UnifiedSegment,
} from '@/lib/itinerary/unified-booking'

/* eslint-disable @typescript-eslint/no-explicit-any */

const round2 = (n: number) => Math.round(n * 100) / 100

export function freshId(): string {
  return `bk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** 'PT2H30M' | 'P1DT2H' → minutes (null when unparseable). */
export function parseIsoDurationMinutes(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/)
  if (!m) return null
  return (parseInt(m[1] ?? '0', 10) * 1440) + (parseInt(m[2] ?? '0', 10) * 60) + parseInt(m[3] ?? '0', 10)
}

// ── Pricing (server-authoritative) ──────────────────────────────────────────

export type PriceResult =
  | { ok: true; pricing: BookingPricing }
  | { ok: false; status: number; error: string; code: string }

/**
 * Supplier amount (major units) → itinerary-currency BookingPricing.
 * Same currency: no conversion. Different currency: EXISTING server-side fx
 * helper; if unavailable we REFUSE (never mix currencies, never relabel).
 * Markup is applied to the amount in the itinerary currency.
 */
export async function priceSupplierAmount(input: {
  productType: 'FLIGHT' | 'HOTEL'
  supplier: 'DUFFEL' | 'HOTELBEDS'
  supplierAmount: number
  supplierCurrency: string
  itineraryCurrency: string
  taxes?: number | null
  traceId?: string
}): Promise<PriceResult> {
  const supCur = input.supplierCurrency.toUpperCase()
  const tgt = (input.itineraryCurrency || 'GBP').toUpperCase()
  if (!Number.isFinite(input.supplierAmount) || input.supplierAmount <= 0) {
    return { ok: false, status: 502, code: 'SUPPLIER_PRICE_INVALID', error: 'The supplier returned no valid price for this option.' }
  }

  let base = input.supplierAmount
  let taxes = input.taxes ?? null
  let converted = false
  if (supCur !== tgt) {
    const fx = await convertSupplierAmount({
      supplierAmountMinor: Math.round(input.supplierAmount * 100),
      supplierCurrency: supCur,
      targetCurrency: tgt,
      traceId: input.traceId,
    })
    if (!fx.ok) {
      return {
        ok: false,
        status: 422,
        code: fx.code,
        error: `${fx.message} This option is priced in ${supCur} and the itinerary is in ${tgt}; it was not added.`,
      }
    }
    const factor = fx.convertedAmountMinor / Math.max(1, Math.round(input.supplierAmount * 100))
    base = fx.convertedAmountMinor / 100
    if (taxes != null) taxes = round2(taxes * factor)
    converted = true
  }

  const price = calculateBookingPrice({
    productType: input.productType,
    supplier: input.supplier,
    netAmount: base,
    currency: tgt,
    markupPercent: defaultMarkupPercent(input.productType, input.supplier),
  })

  return {
    ok: true,
    pricing: {
      currency: tgt,
      supplierTotal: price.supplierCost,
      taxes,
      markupPercent: price.markupPercent,
      markupAmount: price.markupAmount,
      clientTotal: price.sellingPrice,
      supplierCurrency: supCur,
      supplierTotalOriginal: converted ? round2(input.supplierAmount) : null,
      source: 'research',
    },
  }
}

// ── Flights ─────────────────────────────────────────────────────────────────

export interface FlightBuildContext {
  pricing: BookingPricing
  /** Raw supplier total/currency (before any fx) for the offer snapshot */
  supplierTotal: number
  supplierCurrency: string
  passengers?: { adults: number; children: number }
  now?: Date
  addedFrom?: 'research' | 'copilot'
  notes?: string
}

function baggageLabel(segment: any): string | null {
  const bags: any[] = segment?.passengers?.[0]?.baggages ?? []
  if (!Array.isArray(bags) || bags.length === 0) return null
  const parts = bags
    .filter((b) => b && b.quantity > 0)
    .map((b) => `${b.quantity}× ${String(b.type).replace('_', '-')}`)
  return parts.length ? parts.join(', ') : null
}

function cabinLabel(raw: unknown): string {
  const s = String(raw ?? 'economy').toLowerCase()
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function mapSegment(seg: any): UnifiedSegment {
  const dep: string = seg?.departing_at ?? ''
  const arr: string = seg?.arriving_at ?? ''
  const carrier = seg?.marketing_carrier ?? seg?.operating_carrier ?? {}
  const iata: string = carrier.iata_code ?? ''
  const rawNo = String(seg?.marketing_carrier_flight_number ?? seg?.operating_carrier_flight_number ?? '')
  return {
    from: seg?.origin?.iata_code ?? '',
    to: seg?.destination?.iata_code ?? '',
    fromCity: seg?.origin?.city_name ?? seg?.origin?.name ?? null,
    toCity: seg?.destination?.city_name ?? seg?.destination?.name ?? null,
    airline: carrier.name ?? iata,
    iataCode: iata || null,
    flightNumber: rawNo ? `${iata}${rawNo}` : '',
    departureAt: dep || null,
    arrivalAt: arr || null,
    date: dep.slice(0, 10),
    time: dep.slice(11, 16),
    arrivalTime: arr.slice(11, 16),
    durationMinutes: parseIsoDurationMinutes(seg?.duration),
    cabin: cabinLabel(seg?.passengers?.[0]?.cabin_class),
    baggage: baggageLabel(seg),
  }
}

/**
 * Single source of truth for trip type. 1 slice = one-way; 2 slices where
 * slice[1] starts at slice[0]'s final destination AND ends at slice[0]'s
 * origin = return; everything else (open-jaw, 3+ slices) = multi-city.
 * Accepts Duffel slices (origin/destination.iata_code, first-level).
 */
export function classifyTripType(slices: any[] | null | undefined): FlightTripType {
  const list = Array.isArray(slices) ? slices : []
  if (list.length <= 1) return 'one-way'
  if (list.length === 2) {
    const [a, b] = list
    const aFrom = a?.origin?.iata_code, aTo = a?.destination?.iata_code
    const bFrom = b?.origin?.iata_code, bTo = b?.destination?.iata_code
    if (aFrom && aTo && aFrom === bTo && aTo === bFrom) return 'return'
  }
  return 'multi-city'
}

/**
 * Raw Duffel offer → ONE UnifiedFlightBooking (all slices → journeys, all
 * segments preserved). Price comes from ctx.pricing (computed once by the
 * server from the offer's total) and is stored at booking level only.
 */
export function buildUnifiedFlightFromDuffelOffer(offer: any, ctx: FlightBuildContext): UnifiedFlightBooking {
  const slices: any[] = Array.isArray(offer?.slices) ? offer.slices : []
  const tripType = classifyTripType(slices)

  const journeys: FlightJourney[] = slices.map((slice, index) => {
    const segments = (Array.isArray(slice?.segments) ? slice.segments : []).map(mapSegment)
    const direction: FlightJourney['direction'] =
      tripType === 'multi-city' ? 'leg' : index === 0 ? 'outbound' : 'return'
    const summed = segments.reduce((s: number, x: UnifiedSegment) => s + (x.durationMinutes ?? 0), 0)
    return {
      index,
      direction,
      segments,
      durationMinutes: parseIsoDurationMinutes(slice?.duration) ?? (summed || null),
      stops: Math.max(0, segments.length - 1),
    }
  })

  const first = journeys[0]?.segments[0]
  const lastOfFirst = journeys[0]?.segments[journeys[0].segments.length - 1]
  const now = ctx.now ?? new Date()
  const pricing = ctx.pricing

  const pax: any[] = Array.isArray(offer?.passengers) ? offer.passengers : []
  const refs: Record<string, string | number | null> = { offerId: offer?.id ?? null }
  pax.forEach((p, i) => { if (p?.id) refs[`passenger${i + 1}`] = String(p.id) })
  if (offer?.owner?.iata_code) refs.ownerIata = String(offer.owner.iata_code)

  const passengers = ctx.passengers ?? {
    adults: pax.filter((p) => p?.type === 'adult').length || (pax.length ? 0 : 1),
    children: pax.filter((p) => p?.type === 'child').length,
  }

  return {
    id: freshId(),
    bookingKind: 'unified-flight',
    tripType,
    journeys,
    // legacy mirror of the first segment
    from: first?.from ?? '',
    to: lastOfFirst?.to ?? '',
    airline: first?.airline ?? '',
    iataCode: first?.iataCode ?? '',
    flightNumber: first?.flightNumber ?? '',
    date: first?.date ?? '',
    time: first?.time ?? '',
    arrivalTime: lastOfFirst?.arrivalTime ?? '',
    class: first?.cabin ?? 'Economy',
    pnr: '',
    // BOOKING-LEVEL prices, each exactly once
    cost: pricing.clientTotal,
    supplierCost: pricing.supplierTotal,
    status: 'Pending',
    notes: ctx.notes ?? '',
    pricing,
    offer: {
      provider: 'duffel',
      providerOfferId: String(offer?.id ?? ''),
      searchedAt: now.toISOString(),
      expiresAt: offer?.expires_at ?? null,
      supplierCurrency: ctx.supplierCurrency,
      supplierTotal: ctx.supplierTotal,
      params: {
        slices: slices.map((s) => ({
          origin: s?.origin?.iata_code ?? null,
          destination: s?.destination?.iata_code ?? null,
          departureDate: (s?.segments?.[0]?.departing_at ?? '').slice(0, 10) || null,
        })),
        passengers,
      },
      refs,
    },
    passengers,
    addedFrom: ctx.addedFrom ?? 'research',
    addedAt: now.toISOString(),
  }
}

/** Total + tax of a raw Duffel offer (supplier currency, major units). */
export function duffelOfferTotals(offer: any): { total: number; currency: string; taxes: number | null } {
  const total = parseFloat(String(offer?.total_amount ?? '0'))
  const currency = String(offer?.total_currency ?? offer?.base_currency ?? '')
  const tax = offer?.tax_amount != null ? parseFloat(String(offer.tax_amount)) : NaN
  return { total, currency, taxes: Number.isFinite(tax) ? tax : null }
}

// ── Hotels ──────────────────────────────────────────────────────────────────

const BOARD: Record<string, { name: string; breakfast: boolean }> = {
  RO: { name: 'Room Only', breakfast: false },
  BB: { name: 'Bed & Breakfast', breakfast: true },
  HB: { name: 'Half Board', breakfast: true },
  FB: { name: 'Full Board', breakfast: true },
  AI: { name: 'All Inclusive', breakfast: true },
  CB: { name: 'Continental Breakfast', breakfast: true },
}

export interface CheckedRate {
  hotelCode: string
  hotelName: string | null
  checkIn: string | null
  checkOut: string | null
  rateKey: string
  roomCode: string | null
  roomName: string
  boardCode: string | null
  boardName: string | null
  breakfastIncluded: boolean | null
  isRefundable: boolean | null
  cancellationPolicy: string | null
  cancellationDeadline: string | null
  net: number
  currency: string | null
}

/** Pull the requested rate out of a Hotelbeds /checkrates response. */
export function extractCheckedRate(data: any, rateKey: string): CheckedRate | null {
  const hotel = (data?.hotel ?? data?.hotels?.[0] ?? null) as any
  if (!hotel) return null
  for (const room of (hotel.rooms ?? []) as any[]) {
    for (const rate of (room.rates ?? []) as any[]) {
      if (rate?.rateKey !== rateKey) continue
      const board = BOARD[String(rate.boardCode ?? '')]
      const cancels: any[] = Array.isArray(rate.cancellationPolicies) ? rate.cancellationPolicies : []
      let refundable: boolean | null = null
      let policy: string | null = null
      let deadline: string | null = null
      if (rate.rateClass === 'NRF' || rate.rateType === 'NONFLEX') {
        refundable = false
        policy = 'Non-refundable'
      } else if (cancels.length > 0) {
        refundable = true
        deadline = cancels[0]?.from ?? null
        policy = deadline ? `Free cancellation until ${String(deadline).slice(0, 10)}; penalty after` : 'Cancellation policy applies'
      }
      const net = parseFloat(String(rate.net ?? rate.sellingRate ?? 0))
      return {
        hotelCode: String(hotel.code ?? ''),
        hotelName: hotel.name ?? null,
        checkIn: hotel.checkIn ?? null,
        checkOut: hotel.checkOut ?? null,
        rateKey,
        roomCode: room.code ?? null,
        roomName: room.name ?? 'Room',
        boardCode: rate.boardCode ?? null,
        boardName: rate.boardName ?? board?.name ?? null,
        breakfastIncluded: board ? board.breakfast : null,
        isRefundable: refundable,
        cancellationPolicy: policy,
        cancellationDeadline: deadline,
        net,
        currency: rate.currency ?? hotel.currency ?? null,
      }
    }
  }
  return null
}

export interface HotelBuildInput {
  hotelCode: string
  rate: CheckedRate
  pricing: BookingPricing
  name: string
  location?: string
  stars?: number | null
  image?: string
  checkIn: string
  checkOut: string
  nights: number
  occupancy: { rooms: number; adults: number; children: number; childAges?: number[] }
  now?: Date
}

/** Verified Hotelbeds rate + hotel meta → ONE UnifiedHotelBooking (whole stay, one price). */
export function buildResearchHotelBooking(i: HotelBuildInput): UnifiedHotelBooking {
  const now = i.now ?? new Date()
  const rate: HotelRate = {
    providerHotelCode: i.hotelCode,
    rateKey: i.rate.rateKey,
    roomCode: i.rate.roomCode,
    roomName: i.rate.roomName,
    boardCode: i.rate.boardCode,
    boardName: i.rate.boardName,
    breakfastIncluded: i.rate.breakfastIncluded,
    isRefundable: i.rate.isRefundable,
    cancellationPolicy: i.rate.cancellationPolicy,
    cancellationDeadline: i.rate.cancellationDeadline,
    occupancy: i.occupancy,
  }
  return {
    id: freshId(),
    bookingKind: 'research-hotel',
    name: i.name,
    location: i.location ?? '',
    checkIn: i.checkIn,
    checkOut: i.checkOut,
    roomType: i.rate.roomName,
    nights: i.nights,
    cost: i.pricing.clientTotal,
    supplierCost: i.pricing.supplierTotal,
    status: 'Pending',
    notes: '',
    ...(i.image ? { image: i.image } : {}),
    stars: i.stars ?? null,
    rate,
    pricing: i.pricing,
    offer: {
      provider: 'hotelbeds',
      providerOfferId: `${i.hotelCode}:${i.rate.rateKey}`,
      searchedAt: now.toISOString(),
      expiresAt: null,
      supplierCurrency: i.pricing.supplierCurrency ?? i.pricing.currency,
      supplierTotal: i.pricing.supplierTotalOriginal ?? i.pricing.supplierTotal,
      params: { checkIn: i.checkIn, checkOut: i.checkOut, nights: i.nights, ...i.occupancy },
      refs: { hotelCode: i.hotelCode },
    },
    addedFrom: 'research',
    addedAt: now.toISOString(),
  }
}
