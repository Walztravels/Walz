import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      destination,
      checkIn,
      checkOut,
      rooms = 1,
      adults = 2,
      children = 0,
      currency = 'GBP',
      maxResults = 20,
    } = body

    if (!destination || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Destination, check-in and check-out are required' }, { status: 400 })
    }

    const data = await hotelbedsRequest('hotel', '/hotels', {
      method: 'POST',
      body: {
        sourceMarket: 'GB',
        stay: { checkIn, checkOut },
        occupancies: [{ rooms, adults, children }],
        destination: { code: destination },
        filter: { maxHotels: maxResults, minCategory: 1 },
        currency,
        language: 'ENG',
      },
    })

    return NextResponse.json({
      hotels: data.hotels?.hotels ?? [],
      total: data.hotels?.total ?? 0,
      checkIn,
      checkOut,
    })
  } catch (e: any) {
    console.error('Hotel search error:', e.message)
    return NextResponse.json(
      { error: 'Hotel search failed. Please try again.' },
      { status: 500 }
    )
  }
}
