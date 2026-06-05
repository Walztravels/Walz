import { duffelPost } from '@/lib/duffel/client'
import type { WalzFlight, FlightSearchInput } from '@/lib/types/flight'
import type { CabinClass, FlightSegmentResult } from '@/types/booking'

// ─── Duffel API types ─────────────────────────────────────────────────────────

interface DuffelPlace {
  iata_code: string
  name: string
  city_name?: string
  iata_country_code?: string
}

interface DuffelBaggage {
  type: 'carry_on' | 'checked'
  quantity: number
}

interface DuffelSegmentPassenger {
  passenger_id: string
  cabin_class: string
  cabin_class_marketing_name?: string
  baggages: DuffelBaggage[]
}

interface DuffelSegment {
  id: string
  origin: DuffelPlace
  destination: DuffelPlace
  departing_at: string
  arriving_at: string
  duration: string
  aircraft?: { name: string; iata_code?: string }
  marketing_carrier: { iata_code: string; name: string }
  marketing_carrier_flight_number: string
  operating_carrier: { iata_code: string; name: string }
  passengers: DuffelSegmentPassenger[]
  stops: { id: string }[]
}

interface DuffelSlice {
  id: string
  origin: DuffelPlace
  destination: DuffelPlace
  departing_at: string
  arriving_at: string
  duration: string
  segments: DuffelSegment[]
  fare_brand_name?: string
  conditions?: {
    change_before_departure?: DuffelConditionRule | null
    refund_before_departure?: DuffelConditionRule | null
  }
}

interface DuffelPassenger {
  id: string
  type?: 'adult' | 'child' | 'infant_without_seat'
  age?: number
}

interface DuffelConditionRule {
  allowed: boolean
  penalty_amount?: string | null
  penalty_currency?: string | null
}

interface DuffelOffer {
  id: string
  total_amount: string
  total_currency: string
  base_amount: string
  base_currency: string
  tax_amount: string
  tax_currency: string
  cabin_class: string
  slices: DuffelSlice[]
  passengers: DuffelPassenger[]
  conditions: {
    refund_before_departure?: DuffelConditionRule | null
    change_before_departure?: DuffelConditionRule | null
  }
  expires_at: string
  payment_requirements?: {
    requires_instant_payment: boolean
    price_guarantee_expires_at?: string | null
    payment_required_by?: string | null
  }
  available_services?: unknown[]
}

interface DuffelOfferRequestResponse {
  data: {
    id: string
    offers: DuffelOffer[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WALZ_CABIN: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium_economy',
  BUSINESS: 'business',
  FIRST: 'first',
}

const DUFFEL_TO_WALZ_CABIN: Record<string, CabinClass> = {
  economy: 'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business: 'BUSINESS',
  first: 'FIRST',
}

/** Parse ISO 8601 duration "PT13H30M" → minutes */
function parseDuration(iso: string): number {
  const h = iso.match(/(\d+)H/)?.[1] ?? '0'
  const m = iso.match(/(\d+)M/)?.[1] ?? '0'
  return parseInt(h) * 60 + parseInt(m)
}

function transformSegment(seg: DuffelSegment): FlightSegmentResult {
  const firstPax = seg.passengers[0]
  return {
    departureAirport: seg.origin.iata_code,
    arrivalAirport: seg.destination.iata_code,
    departureTime: seg.departing_at,
    arrivalTime: seg.arriving_at,
    airline: seg.marketing_carrier.name,
    airlineCode: seg.marketing_carrier.iata_code,
    flightNumber: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
    duration: parseDuration(seg.duration),
    aircraft: seg.aircraft?.name,
    cabinClass: DUFFEL_TO_WALZ_CABIN[firstPax?.cabin_class ?? ''] ?? 'ECONOMY',
    bookingCode: '',
  }
}

function extractBaggage(seg: DuffelSegment) {
  const pax = seg.passengers[0]
  if (!pax?.baggages?.length) return undefined
  const carry = pax.baggages.find((b) => b.type === 'carry_on')
  const checked = pax.baggages.find((b) => b.type === 'checked')
  return {
    carry: carry ? `${carry.quantity} × carry-on` : 'None',
    checked: checked ? `${checked.quantity} × 23kg` : 'None',
  }
}

function extractPenalty(cond: DuffelConditionRule | undefined, fallbackCurrency: string) {
  if (!cond?.allowed) return undefined  // not allowed → undefined
  if (cond.penalty_amount == null) return null  // allowed, no penalty → free
  return { amount: cond.penalty_amount, currency: cond.penalty_currency ?? fallbackCurrency }
}

function worstCaseCondition(
  offerCond: DuffelConditionRule | null | undefined,
  slices: DuffelSlice[],
  key: 'change_before_departure' | 'refund_before_departure'
): DuffelConditionRule | undefined {
  const all = [offerCond, ...slices.map((s) => s.conditions?.[key])]
    .filter((c): c is DuffelConditionRule => c != null)
  if (all.length === 0) return undefined
  const anyBlocked = all.some((c) => !c.allowed)
  if (anyBlocked) return { allowed: false, penalty_amount: null, penalty_currency: null }
  const maxPenalty = all.reduce((max, c) => {
    const v = parseFloat(c.penalty_amount ?? '0')
    return v > max ? v : max
  }, 0)
  const refCond = all[0]
  return {
    allowed: true,
    penalty_amount: maxPenalty > 0 ? String(maxPenalty.toFixed(2)) : null,
    penalty_currency: refCond.penalty_currency ?? null,
  }
}

function transformOffer(
  offer: DuffelOffer,
  index: number,
  isMultiCity = false
): WalzFlight {
  const outboundSlice = offer.slices[0]
  const inboundSlice = !isMultiCity && offer.slices.length === 2 ? offer.slices[1] : undefined

  const outbound = outboundSlice.segments.map(transformSegment)
  const inbound = inboundSlice ? inboundSlice.segments.map(transformSegment) : undefined

  // For multi-city, store each slice's segments separately
  const multiCitySlices = isMultiCity
    ? offer.slices.map((s) => s.segments.map(transformSegment))
    : undefined

  const firstSeg = outboundSlice.segments[0]
  const flightNum = `${firstSeg.marketing_carrier.iata_code}${firstSeg.marketing_carrier_flight_number}`
  const depDate = firstSeg.departing_at.slice(0, 10)
  const matchKey = `${flightNum}_${depDate}`

  const totalPassengers = offer.passengers.length
  const totalAmount = parseFloat(offer.total_amount)
  const perPerson = totalPassengers > 0 ? totalAmount / totalPassengers : totalAmount
  const currency = offer.total_currency

  // For multi-city, count stops across all slices
  const stops = isMultiCity
    ? offer.slices.reduce((acc, s) => acc + Math.max(0, s.segments.length - 1), 0) + (offer.slices.length - 1)
    : outboundSlice.segments.length - 1

  const totalDuration = offer.slices.reduce((acc, s) => acc + parseDuration(s.duration), 0)
  const cabinClass = DUFFEL_TO_WALZ_CABIN[offer.cabin_class] ?? 'ECONOMY'
  const baggage = extractBaggage(firstSeg)

  const refundCond = worstCaseCondition(offer.conditions?.refund_before_departure, offer.slices, 'refund_before_departure')
  const changeCond = worstCaseCondition(offer.conditions?.change_before_departure, offer.slices, 'change_before_departure')

  const isRefundable = refundCond?.allowed ?? false
  const refundPenalty = extractPenalty(refundCond, currency)
  const changePenalty = extractPenalty(changeCond, currency)

  return {
    id: `duffel-${index}-${offer.id}`,
    tripType: isMultiCity ? 'multicity' : (inboundSlice ? 'roundtrip' : 'oneway'),
    source: 'duffel',
    matchKey,
    duffelOfferId: offer.id,
    duffelExpiresAt: offer.expires_at,
    outbound,
    inbound,
    multiCitySlices,
    price: { amount: totalAmount, currency, perPerson },
    displayPrice: { amount: totalAmount, currency, perPerson },
    stops,
    totalDuration,
    cabinClass,
    seatsRemaining: undefined,
    isRefundable,
    refundPenalty,
    changePenalty,
    validatingCarrier: firstSeg.marketing_carrier.iata_code,
    baggage,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function searchDuffel(params: FlightSearchInput): Promise<WalzFlight[]> {
  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) {
    console.warn('[Duffel] DUFFEL_ACCESS_TOKEN not set — skipping Duffel')
    return []
  }

  const cabinClass = WALZ_CABIN[params.cabinClass ?? 'ECONOMY'] ?? 'economy'
  const isMultiCity = params.tripType === 'multicity'

  // Build passengers array
  const passengers: Array<{ type: string } | { age: number }> = [
    ...Array.from({ length: params.adults }, () => ({ type: 'adult' })),
    ...Array.from({ length: params.children ?? 0 }, () => ({ age: 10 })),
    ...Array.from({ length: params.infants ?? 0 }, () => ({ type: 'infant_without_seat' })),
  ]

  type DuffelSliceInput = {
    origin: string
    destination: string
    departure_date: string
    departure_time?: { from: string; to: string }
    arrival_time?: { from: string; to: string }
  }

  let slices: DuffelSliceInput[]

  if (isMultiCity && params.segments && params.segments.length >= 2) {
    // ── Multi-city: one slice per leg ────────────────────────────────────────
    slices = params.segments.map((seg) => ({
      origin: seg.origin,
      destination: seg.destination,
      departure_date: seg.departureDate,
    }))
  } else {
    // ── Oneway / roundtrip ───────────────────────────────────────────────────
    const origin = params.origin ?? ''
    const destination = params.destination ?? ''
    const departureDate = params.departureDate ?? ''

    const outbound: DuffelSliceInput = {
      origin,
      destination,
      departure_date: departureDate,
      ...(params.departureTime ? { departure_time: params.departureTime } : {}),
      ...(params.arrivalTime ? { arrival_time: params.arrivalTime } : {}),
    }
    slices = [outbound]

    if (params.returnDate) {
      slices.push({
        origin: destination,
        destination: origin,
        departure_date: params.returnDate,
        ...(params.returnDepartureTime ? { departure_time: params.returnDepartureTime } : {}),
        ...(params.returnArrivalTime ? { arrival_time: params.returnArrivalTime } : {}),
      })
    }
  }

  try {
    const result = await duffelPost<DuffelOfferRequestResponse>(
      '/air/offer_requests',
      {
        data: {
          slices,
          passengers,
          cabin_class: cabinClass,
          ...(params.directOnly ? { max_connections: 0 } : {}),
        },
      },
      { return_offers: 'true', supplier_timeout: '10000' }
    )

    const offers = result.data?.offers ?? []
    return offers
      .slice(0, 50)
      .map((offer, i) => transformOffer(offer, i, isMultiCity))
  } catch (err) {
    console.error('[Duffel] Search error:', err)
    return []
  }
}
