import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function POST(req: NextRequest) {
  try {
    const {
      destination,
      checkIn,
      checkOut,
      adults = 2,
      children = 0,
      childAges = [],
      rooms = 1,
      currency = 'GBP',
      sourceMarket = 'GB',
      minCategory = 3,
    } = await req.json()

    // Cert 3.3 — children age mandatory when children > 0
    const occupancy: Record<string, unknown> = { rooms, adults, children }
    if (children > 0 && childAges.length > 0) {
      occupancy.paxes = childAges.map((age: number) => ({ type: 'CH', age }))
    }

    const data = await hotelbedsRequest('hotel', '/hotels', {
      method: 'POST',
      body: {
        sourceMarket,
        stay: { checkIn, checkOut },
        occupancies: [occupancy],
        destination: { code: destination },
        filter: {
          maxHotels: 20,
          minCategory,
          maxRatesPerRoom: 5,
        },
        currency,
        language: 'ENG',
        reviews: [{ type: 'HOTELBEDS', maxRate: 5, minRate: 1, minReviewCount: 3 }],
        accommodations: ['HOTEL'],
      },
    })

    const hotels = (data.hotels?.hotels ?? []).map((h: any) => ({
      code:            h.code,
      name:            h.name,
      categoryName:    h.categoryName,
      categoryCode:    h.categoryCode,
      destinationCode: h.destinationCode,
      destinationName: h.destinationName,
      zoneCode:        h.zoneCode,
      zoneName:        h.zoneName,
      latitude:        h.latitude,
      longitude:       h.longitude,
      minRate:         h.minRate,
      maxRate:         h.maxRate,
      currency:        h.currency,
      rooms:           h.rooms,
      reviews:         h.reviews,
    }))

    return NextResponse.json({ hotels, total: data.hotels?.total ?? 0, checkIn, checkOut })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
