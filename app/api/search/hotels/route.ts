import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { countryToTimezone, destinationToTimezone } from '@/lib/timezones'
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
      childAges,
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

    // Hotelbeds requires paxes[] per child in occupancies when children >= 1
    const ages: number[] = Array.isArray(childAges) ? childAges : []
    const childPaxes = children > 0
      ? (ages.length === children
          ? ages.map((age: number) => ({ type: 'CH', age }))
          : Array.from({ length: children }, (_, i) => ({ type: 'CH', age: ages[i] ?? 8 })))
      : undefined

    const occupancy: Record<string, unknown> = { rooms, adults, children }
    if (childPaxes) occupancy.paxes = childPaxes

    let data: any
    try {
      data = await hotelbedsRequest('hotel', '/hotels', {
        method: 'POST',
        body: {
          stay:         { checkIn, checkOut },
          occupancies:  [occupancy],
          destination:  { code: String(destination).toUpperCase() },
          filter,
          currency,
          language:     'ENG',
          sourceMarket: 'GB',
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
        const noResults = msg.toLowerCase().includes('no results') || msg.toLowerCase().includes('not found')
        return NextResponse.json(
          { error: noResults
              ? 'No hotels found for this destination. Please try a different location or dates.'
              : 'Hotel search failed. Please check your search details and try again.' },
          { status: 400 }
        )
      }
      throw err
    }

    const rawHotels = data.hotels?.hotels ?? []
    // Destination timezone applies to all hotels in the result — derive once from the
    // destination code the user searched for rather than per-hotel (content API unreliable).
    const destTimezone = destinationToTimezone(String(destination))

    // Fetch images + country from content API — non-critical, bail after 8 s
    // countryCode is not in the availability response; content API supplies it
    const hotelCodes = rawHotels.map((h: any) => String(h.code)).join(',')
    let imagesByCode:   Record<string, string[]> = {}
    let countryByCode:  Record<string, string>   = {}
    if (hotelCodes) {
      try {
        const imagePromise = hotelbedsRequest('content', '/hotels', {
          params: { codes: hotelCodes, fields: 'images,country', language: 'ENG' },
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
            imagesByCode[String(ch.code)]  = sorted.slice(0, 5).map((img: any) => IMAGE_CDN + img.path)
            countryByCode[String(ch.code)] = ch.country?.code ?? ''
          }
        }
      } catch {
        // Images/country are non-critical — proceed without them
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

      // countryCode comes from content API (not availability response)
      const countryCode = countryByCode[String(h.code)] || h.countryCode || ''
      const addrParts   = [addressLine, h.destinationName, countryCode].filter(Boolean)

      return {
        id:        String(h.code),
        rateKey,
        hotelCode: String(h.code),
        chainCode: h.chainCode ?? '',
        name:      h.name ?? 'Unknown Hotel',
        address: {
          lines:    [addressLine].filter(Boolean),
          city:     h.destinationName ?? '',
          country:  countryCode,
          postcode: h.postalCode      ?? undefined,
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
        cancellationPolicy: (() => {
          if (!policies[0]) return 'Free cancellation'
          const deadline = new Date(policies[0].from)
          // Only show a meaningful deadline when the grace period is still in the future.
          // NRF rates have a policy from = today/past; returning undefined lets the UI
          // fall back to its isRefundable-based copy ("Non-refundable").
          return deadline > new Date()
            ? `Free cancellation until ${deadline.toLocaleDateString('en-GB')}`
            : undefined
        })(),
        rateCommentsId:      rate?.rateCommentsId ?? undefined,
        hotelAddress:        addrParts.join(', ') || undefined,
        destinationTimezone: destTimezone !== 'UTC'
          ? destTimezone
          : countryCode ? countryToTimezone(countryCode) : 'UTC',
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
