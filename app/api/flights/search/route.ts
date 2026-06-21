import { NextRequest, NextResponse } from 'next/server'
import { searchFlights, assignBadges } from '@/lib/flights/duffel'
import { generateMockResults }         from '@/lib/flights/mockData'
import type { FlightSearchParams }     from '@/lib/flights/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { from, to, depart, return: ret, trip, cabin, adults, children, infants } = body

    const legs = trip === 'round-trip' && ret
      ? [{ from, to, date: depart }, { from: to, to: from, date: ret }]
      : [{ from, to, date: depart }]

    const params: FlightSearchParams = {
      tripType:   trip ?? 'one-way',
      cabin:      cabin ?? 'ECONOMY',
      passengers: {
        adults:   Number(adults)   || 1,
        children: Number(children) || 0,
        infants:  Number(infants)  || 0,
      },
      legs,
    }

    if (process.env.DUFFEL_ACCESS_TOKEN) {
      try {
        const results = await searchFlights(params)
        return NextResponse.json({ results, source: 'duffel' })
      } catch (err) {
        console.error('[flights/search] Duffel error, falling back to mock:', err)
      }
    }

    const paxCount = params.passengers.adults + params.passengers.children + params.passengers.infants
    const results  = assignBadges(generateMockResults(from, to, cabin, paxCount))
    return NextResponse.json({ results, source: 'mock' })
  } catch (err) {
    console.error('[flights/search] Error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
