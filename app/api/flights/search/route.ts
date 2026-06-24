import { NextRequest, NextResponse }            from 'next/server'
import { searchFlights, assignBadges }          from '@/lib/flights/duffel'
import type { FlightSearchParams, CabinClass }  from '@/lib/flights/types'

const CABIN_MAP: Record<string, CabinClass> = {
  economy:         'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business:        'BUSINESS',
  first:           'FIRST',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { from, to, depart, return: ret, trip, cabin, adults, children, infants } = body

    if (!from || !to || !depart) {
      return NextResponse.json({ error: 'Missing required fields: from, to, depart' }, { status: 400 })
    }

    if (!process.env.DUFFEL_ACCESS_TOKEN) {
      console.error('[flights/search] DUFFEL_ACCESS_TOKEN not set')
      return NextResponse.json({ error: 'Flight search is temporarily unavailable', source: 'error' }, { status: 503 })
    }

    const legs = trip === 'round-trip' && ret
      ? [{ from, to, date: depart }, { from: to, to: from, date: ret }]
      : [{ from, to, date: depart }]

    const params: FlightSearchParams = {
      tripType:   trip ?? 'one-way',
      cabin:      CABIN_MAP[String(cabin).toLowerCase()] ?? 'ECONOMY',
      passengers: {
        adults:   Number(adults)   || 1,
        children: Number(children) || 0,
        infants:  Number(infants)  || 0,
      },
      legs,
    }

    const results = await searchFlights(params)

    return NextResponse.json({
      results: assignBadges(results),
      source: 'duffel_live',
      totalOffers: results.length,
    })

  } catch (err: unknown) {
    console.error('[flights/search]', err)

    const msg = err instanceof Error ? err.message : String(err)

    // Surface Duffel validation errors
    if (msg.includes('Duffel') || msg.includes('422') || msg.includes('validation')) {
      return NextResponse.json({ error: msg, source: 'duffel_error' }, { status: 422 })
    }

    return NextResponse.json({ error: 'Search failed. Please try again.', source: 'error' }, { status: 500 })
  }
}
