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

    // Minimum required fields only — sourceMarket and reviews are optional and can cause failures
    let data: any
    try {
      data = await hotelbedsRequest('hotel', '/hotels', {
        method: 'POST',
        body: {
          stay:        { checkIn, checkOut },
          occupancies: [{ rooms, adults, children }],
          destination: { code: String(destination).toUpperCase() },
          filter,
          currency,
          language: 'ENG',
        },
      })
    } catch (err: any) {
      const msg = String(err.message ?? '')
      console.error('[hotel-search] Hotelbeds error:', msg)
      if (msg.includes('403') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit')) {
        return NextResponse.json(
          { error: 'Hotel availability is temporarily unavailable due to high demand. Please try again in a few minutes.' },
          { status: 503 }
        )
      }
      if (msg.includes('400')) {
        return NextResponse.json(
          { error: 'No hotels found for this destination. Please try a different location or dates.' },
          { status: 400 }
        )
      }
      throw err
    }

    const rawHotels = data.hotels?.hotels ?? []

    // Fetch images from content API — non-critical, bail after 8 s
    const hotelCodes = rawHotels.map((h: any) => String(h.code)).join(',')
    let imagesByCode: Record<string, string[]> = {}
    if (hotelCodes) {
      try {
        const imagePromise = hotelbedsRequest('content', '/hotels', {
          params: { codes: hotelCodes, fields: 'images', language: 'ENG' },
        })
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('images timeout')), 8000)
        )
        const contentData = await Promise.race([imagePromise, timeoutPromise]) as any
        if (contentData) {
          const IMAGE_CDN = 'https://photos.hotelbeds.com/giata/'
          const PREFERRED = ['CON', 'FAC', 'PIE', 'GEN']
          for (const ch of (contentData.hotels ?? [])) {
            const imgs: any[] = ch.images ?? []
            const sorted = imgs.sort((a: any, b: any) => {
              const ai = PREFERRED.indexOf(a.imageTypeCode)
              const bi = PREFERRED.indexOf(b.imageTypeCode)
              const ap = ai === -1 ? 99 : ai
              const bp = bi === -1 ? 99 : bi
              return ap !== bp ? ap - bp : (a.visualOrder ?? 999) - (b.visualOrder ?? 999)
            })
            imagesByCode[String(ch.code)] = sorted.slice(0, 5).map((img: any) => IMAGE_CDN + img.path)
          }
        }
      } catch {
        // Images are non-critical — proceed without them
      }
    }

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
      const rateKey     = rate?.rateKey ?? ''

      return {
        id:        String(h.code),
        rateKey,
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
        images:      imagesByCode[String(h.code)] ?? [],
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
