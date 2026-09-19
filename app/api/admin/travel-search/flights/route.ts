import { NextRequest, NextResponse }            from 'next/server'
import { getAdminSession }                       from '@/lib/admin-auth'
import { hasPermission }                         from '@/lib/admin/permissions'
import { searchFlights, assignBadges }           from '@/lib/flights/duffel'
import type { FlightSearchParams, CabinClass, FlightItinerary, FlightSegment } from '@/lib/flights/types'
import type { NormalizedFlightOffer, NormalizedFlightSegment } from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

const CABIN_MAP: Record<string, CabinClass> = {
  economy:         'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business:        'BUSINESS',
  first:           'FIRST',
}

function segmentToNormalized(seg: FlightSegment, order: number): NormalizedFlightSegment {
  return {
    segmentOrder:        order,
    originCode:          seg.departureIata,
    originCity:          seg.departureCity ?? null,
    originTerminal:      null,
    destinationCode:     seg.arrivalIata,
    destinationCity:     seg.arrivalCity ?? null,
    destinationTerminal: null,
    departureAt:         seg.departureTime,
    arrivalAt:           seg.arrivalTime,
    flightNumber:        seg.flightNumber ?? null,
    operatingCarrier:    seg.airline ?? null,
    marketingCarrier:    seg.airline ?? null,
    aircraft:            seg.aircraft ?? null,
    durationMinutes:     seg.durationMins ?? null,
    stops:               0,
    layoverMinutes:      null,
  }
}

function itineraryToNormalized(it: FlightItinerary, searchedAt: string): NormalizedFlightOffer {
  const outSegs  = it.segments ?? []
  const retSegs  = it.returnSegments ?? []
  const first    = outSegs[0]
  const last     = outSegs[outSegs.length - 1]

  const supplierTotalAmount = it.price?.total ?? 0
  const currency            = it.price?.currency ?? 'GBP'
  // Convert to minor units (assume 2 decimal places for most currencies)
  const supplierTotalMinor  = Math.round(supplierTotalAmount * 100)

  const bag = it.baggageInfo
  const checkedPieces = bag?.checked?.match(/(\d+)\s*[x×]/i)?.[1]
    ? parseInt(bag.checked.match(/(\d+)\s*[x×]/i)![1], 10)
    : null
  const checkedWeight = bag?.checked?.match(/\d+\s*kg/i)?.[0] ?? null

  const tripType = retSegs.length > 0 ? 'round-trip' : outSegs.length > 2 ? 'multi-city' : 'one-way'

  return {
    provider:          'duffel',
    providerOfferId:   it.id,
    searchedAt,
    airline:           first?.airlineName ?? first?.airline ?? '',
    airlineCode:       first?.airline ?? null,
    tripType,
    cabinClass:        outSegs[0]?.cabinClass ?? 'ECONOMY',
    supplierCurrency:  currency,
    supplierTotalAmount,
    supplierTotalMinor,
    offerExpiresAt:    it.expiresAt ?? null,
    isRefundable:      it.refundable ?? false,
    isChangeable:      it.changeable ?? false,
    changeFee:         null,
    noShowRule:        null,
    fareClass:         null,
    fareFamily:        it.fareType ?? null,
    personalItem:      null,
    cabinBaggage:      bag?.cabin ?? null,
    checkedBaggage:    bag?.checked ?? null,
    checkedPieces,
    checkedWeight,
    seatIncluded:      false,
    mealIncluded:      false,
    seatsLeft:         it.seatsLeft ?? null,
    segments:          outSegs.map((s, i) => segmentToNormalized(s, i)),
    returnSegments:    retSegs.map((s, i) => segmentToNormalized(s, i)),
  }
}

// POST /api/admin/travel-search/flights
// Admin-only live flight search via Duffel
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { from, to, depart, return: ret, trip, cabin, adults, children, infants, segments } = body

    // Closing security hardening: the UI already caps multi-city at 5 legs
    // (CreateQuoteDrawer.tsx / FlightSearchWidget.tsx, MC_MAX_LEGS) — that
    // cap is client-side only and was never enforced here, so a direct API
    // call could submit an arbitrarily large segments array straight into
    // the Duffel request below. Validated up front, using the same inline
    // "required field" convention this route already uses just below
    // (a controlled {error} 400, not a new validation schema/library) —
    // rejects before searchFlights()/Duffel is ever called.
    if (trip === 'multi-city') {
      if (!Array.isArray(segments)) {
        return NextResponse.json({ error: 'Multi-city requires a segments array.' }, { status: 400 })
      }
      if (segments.length < 2) {
        return NextResponse.json({ error: 'Multi-city requires at least 2 segments.' }, { status: 400 })
      }
      if (segments.length > 5) {
        return NextResponse.json({ error: 'Multi-city supports a maximum of 5 segments.' }, { status: 400 })
      }
      const IATA_RE = /^[A-Za-z]{3}$/
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i] as { from?: unknown; to?: unknown; date?: unknown } | null | undefined
        if (typeof s?.from !== 'string' || !IATA_RE.test(s.from.trim())) {
          return NextResponse.json({ error: `Segment ${i + 1}: a valid 3-letter "from" airport code is required.` }, { status: 400 })
        }
        if (typeof s?.to !== 'string' || !IATA_RE.test(s.to.trim())) {
          return NextResponse.json({ error: `Segment ${i + 1}: a valid 3-letter "to" airport code is required.` }, { status: 400 })
        }
        if (typeof s?.date !== 'string' || !DATE_RE.test(s.date.trim()) || Number.isNaN(new Date(s.date).getTime())) {
          return NextResponse.json({ error: `Segment ${i + 1}: a valid departure date is required.` }, { status: 400 })
        }
      }
    }

    const isMultiCity = trip === 'multi-city' && Array.isArray(segments) && segments.length >= 2

    if (!isMultiCity && (!from || !to || !depart)) {
      return NextResponse.json({ error: 'from, to, depart are required' }, { status: 400 })
    }

    if (!process.env.DUFFEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Flight search not configured' }, { status: 503 })
    }

    const legs = isMultiCity
      ? (segments as Array<{ from: string; to: string; date: string }>).map(s => ({ from: s.from, to: s.to, date: s.date }))
      : trip === 'round-trip' && ret
        ? [{ from, to, date: depart }, { from: to, to: from, date: ret }]
        : [{ from, to, date: depart }]

    const params: FlightSearchParams = {
      tripType:   trip ?? 'one-way',
      cabin:      CABIN_MAP[String(cabin ?? 'economy').toLowerCase()] ?? 'ECONOMY',
      passengers: {
        adults:   Number(adults)   || 1,
        children: Number(children) || 0,
        infants:  Number(infants)  || 0,
      },
      legs,
    }

    const searchedAt = new Date().toISOString()
    const results    = assignBadges(await searchFlights(params))

    const offers: NormalizedFlightOffer[] = results.map(it => itineraryToNormalized(it, searchedAt))

    return NextResponse.json({
      offers,
      searchedAt,
      totalOffers: offers.length,
      provider: 'duffel',
      searchParams: { from, to, depart, return: ret, trip, cabin, adults, children, infants },
    })

  } catch (err: unknown) {
    console.error('[admin/travel-search/flights]', err)

    const msg = err instanceof Error ? err.message : String(err)

    // Surface Duffel validation errors distinctly (mirrors /api/flights/search)
    if (msg.includes('Duffel') || msg.includes('422') || msg.includes('validation')) {
      return NextResponse.json({ error: msg, source: 'duffel_error' }, { status: 422 })
    }

    return NextResponse.json({ error: 'Search failed. Please try again.', source: 'error' }, { status: 500 })
  }
}
