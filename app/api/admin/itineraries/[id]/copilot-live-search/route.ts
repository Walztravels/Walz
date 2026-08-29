// app/api/admin/itineraries/[id]/copilot-live-search/route.ts
// Live search for flights, hotels, and activities via Jade Copilot

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params // consume params (itinerary id not needed for search itself)

  const { type, params: searchParams } = await req.json() as {
    type: 'flights' | 'hotels' | 'activities'
    params: Record<string, unknown>
  }

  if (type === 'flights') {
    try {
      const { searchFlights } = await import('@/lib/flights/duffel')
      const { FlightSearchParams } = await import('@/lib/flights/types').then(m => ({ FlightSearchParams: m })).catch(() => ({ FlightSearchParams: null }))
      void FlightSearchParams // just to suppress unused warning

      const legs: Array<{ from: string; to: string; date: string }> = [
        {
          from: String(searchParams.origin ?? ''),
          to: String(searchParams.destination ?? ''),
          date: String(searchParams.departure_date ?? ''),
        },
      ]
      if (searchParams.return_date) {
        legs.push({
          from: String(searchParams.destination ?? ''),
          to: String(searchParams.origin ?? ''),
          date: String(searchParams.return_date),
        })
      }

      const flightParams = {
        tripType: (searchParams.return_date ? 'round-trip' : 'one-way') as 'round-trip' | 'one-way',
        cabin: (searchParams.cabin || 'ECONOMY') as import('@/lib/flights/types').CabinClass,
        passengers: {
          adults: Number(searchParams.adults ?? 1),
          children: 0,
          infants: 0,
        },
        legs,
      }

      const offers = await searchFlights(flightParams)
      const results = offers.slice(0, 5).map((offer) => {
        const seg = offer.segments[0]
        return {
          type: 'flight' as const,
          id: offer.id,
          summary: `${seg.airline} ${seg.flightNumber} · ${offer.stops === 0 ? 'Direct' : offer.stops + ' stop'}`,
          from: seg.departureIata,
          to: seg.arrivalIata,
          date: searchParams.departure_date,
          departureTime: seg.departureTime,
          arrivalTime: seg.arrivalTime,
          airline: seg.airlineName ?? seg.airline,
          flightNumber: seg.flightNumber ?? '',
          class: searchParams.cabin || 'ECONOMY',
          price: offer.price.total,
          currency: offer.price.currency,
          stops: offer.stops,
        }
      })

      return NextResponse.json({ results })
    } catch {
      return NextResponse.json({ results: [] })
    }
  }

  if (type === 'hotels') {
    return NextResponse.json({
      results: [],
      message: 'Hotel live search — use the Hotels tab to add hotels manually or paste a website URL to fetch images',
    })
  }

  if (type === 'activities') {
    return NextResponse.json({
      results: [],
      message: 'Activity live search — describe the activity you need and Jade will generate itinerary details',
    })
  }

  return NextResponse.json({ results: [] })
}
