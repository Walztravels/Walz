import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import type { HotelResult } from '@/types/booking'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      destination,
      checkIn,
      checkOut,
      rooms      = 1,
      adults     = 2,
      children   = 0,
      currency   = 'GBP',
      maxResults = 20,
      starRating,
    } = body

    if (!destination || !checkIn || !checkOut) {
      return NextResponse.json(
        { error: 'Destination, check-in and check-out are required' },
        { status: 400 }
      )
    }

    const checkInDate  = new Date(checkIn)
    const checkOutDate = new Date(checkOut)
    const today        = new Date()
    today.setHours(0, 0, 0, 0)

    if (checkInDate < today) {
      return NextResponse.json({ error: 'Check-in date must be in the future' }, { status: 400 })
    }
    if (checkOutDate <= checkInDate) {
      return NextResponse.json({ error: 'Check-out must be after check-in' }, { status: 400 })
    }

    const filter: Record<string, unknown> = { maxHotels: Math.min(maxResults, 50) }
    if (Array.isArray(starRating) && starRating.length) {
      filter.minCategory = Math.min(...starRating)
      filter.maxCategory = Math.max(...starRating)
    }

    const data = await hotelbedsRequest('hotel', '/hotels', {
      method: 'POST',
      body: {
        sourceMarket: 'GB',
        stay:         { checkIn, checkOut },
        occupancies:  [{ rooms, adults, children }],
        destination:  { code: String(destination).toUpperCase() },
        filter,
        currency,
        language: 'ENG',
        reviews: [{ type: 'HOTELBEDS', maxRate: 5, minRate: 1, minReviewCount: 1 }],
      },
    })

    const rawHotels = data.hotels?.hotels ?? []

    const nights = Math.max(
      1,
      Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)),
    )

    const hotels: HotelResult[] = rawHotels.map((h: any) => {
      const rate          = h.rooms?.[0]?.rates?.[0]
      const totalNet      = parseFloat(rate?.net ?? h.minRate ?? '0')
      const pricePerNight = Math.round((totalNet / nights) * 100) / 100
      const totalPrice    = Math.round(totalNet * 100) / 100
      const stars         = parseInt(h.categoryCode?.replace(/\D/g, '') || '3', 10) || 3

      const policies     = rate?.cancellationPolicies ?? []
      const isRefundable = policies.length === 0 || new Date(policies[0]?.from) > new Date()

      const review      = h.reviews?.[0]
      const addressLine = [h.address, h.zoneName].find(Boolean) ?? h.destinationName ?? ''

      return {
        id:        String(h.code),
        hotelCode: String(h.code),
        chainCode: h.chainCode ?? '',
        name:      h.name ?? 'Unknown Hotel',
        address: {
          lines:    [addressLine].filter(Boolean),
          city:     h.destinationName ?? '',
          country:  h.countryCode    ?? '',
          postcode: h.postalCode     ?? undefined,
        },
        stars,
        pricePerNight: { amount: pricePerNight, currency },
        totalPrice:    { amount: totalPrice,    currency },
        amenities:   [],
        images:      [],
        rating:      review?.rate       ?? undefined,
        reviewCount: review?.reviewCount ?? undefined,
        isRefundable,
        roomType:   h.rooms?.[0]?.name  ?? undefined,
        mealPlan:   rate?.boardName      ?? undefined,
        cancellationPolicy: policies[0]
          ? `Cancellation fee applies from ${new Date(policies[0].from).toLocaleDateString('en-GB')}`
          : 'Free cancellation',
      } satisfies HotelResult
    })

    return NextResponse.json(hotels)
  } catch (error: any) {
    console.error('[hotel-search] error:', error.message)
    return NextResponse.json(
      { error: 'Hotel search failed. Please try again.' },
      { status: 500 }
    )
  }
}
