import { NextRequest, NextResponse }  from 'next/server'
import { getAdminSession }            from '@/lib/admin-auth'
import { hasPermission }              from '@/lib/admin/permissions'
import { hotelbedsRequest }           from '@/lib/hotelbeds'
import type { NormalizedHotelOffer, NormalizedHotelRate } from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

const BOARD_MAP: Record<string, { name: string; breakfast: boolean }> = {
  RO: { name: 'Room Only',         breakfast: false },
  BB: { name: 'Bed & Breakfast',   breakfast: true  },
  HB: { name: 'Half Board',        breakfast: true  },
  FB: { name: 'Full Board',        breakfast: true  },
  AI: { name: 'All Inclusive',     breakfast: true  },
  CB: { name: 'Continental Breakfast', breakfast: true },
}

function parseCancellation(rate: Record<string, unknown>): { refundable: boolean; policy: string | null; deadline: string | null } {
  const type = (rate.rateType ?? rate.ratePlanCode ?? '') as string
  const cancellations = (rate.cancellationPolicies as unknown[]) ?? []
  if (type === 'RECHECK') {
    return { refundable: true, policy: 'Recheck rate — terms apply', deadline: null }
  }
  if ((rate.allotment as number) === 0 || type === 'NONFLEX') {
    return { refundable: false, policy: 'Non-refundable', deadline: null }
  }
  if (cancellations.length > 0) {
    const first = cancellations[0] as Record<string, unknown>
    const deadline = (first.from as string) ?? null
    const amount   = (first.amount as number) ?? null
    const policy = amount != null && amount > 0
      ? `Cancel free before ${deadline ?? 'check-in'}; penalty after`
      : 'Free cancellation'
    return { refundable: true, policy, deadline }
  }
  return { refundable: true, policy: 'Free cancellation', deadline: null }
}

function normalizeRate(rate: Record<string, unknown>, checkIn: string, checkOut: string, nights: number, rooms: number): NormalizedHotelRate {
  const net      = parseFloat(String(rate.net ?? rate.sellingRate ?? 0))
  const currency = (rate.currency as string) ?? 'GBP'
  const minor    = Math.round(net * 100)
  const board    = BOARD_MAP[(rate.boardCode as string) ?? ''] ?? null
  const { refundable, policy, deadline } = parseCancellation(rate)

  return {
    rateKey:             (rate.rateKey as string) ?? '',
    roomCode:            (rate.rooms as Array<Record<string, unknown>>)?.[0]?.code as string ?? null,
    roomName:            (rate.rooms as Array<Record<string, unknown>>)?.[0]?.name as string ?? null,
    boardCode:           (rate.boardCode as string) ?? null,
    boardName:           board?.name ?? null,
    mealPlan:            board?.name ?? null,
    breakfastIncluded:   board?.breakfast ?? false,
    isRefundable:        refundable,
    cancellationPolicy:  policy,
    cancellationDeadline: deadline,
    supplierCurrency:    currency,
    supplierAmount:      net,
    supplierAmountMinor: minor,
    perNightAmount:      nights > 0 ? Math.round((net / nights) * 100) / 100 : null,
    nights,
  }
}

function normalizeHotel(
  h: Record<string, unknown>,
  checkIn: string,
  checkOut: string,
  nights: number,
  rooms: number,
  adults: number,
  children: number,
): NormalizedHotelOffer {
  const rawRooms  = (h.rooms as Array<Record<string, unknown>>) ?? []
  const rates: NormalizedHotelRate[] = rawRooms
    .flatMap(r => {
      const roomRates = (r.rates as Array<Record<string, unknown>>) ?? []
      return roomRates.map(rate => ({
        ...rate,
        rooms: [{ code: r.code, name: r.name }],
      }))
    })
    .map(rate => normalizeRate(rate, checkIn, checkOut, nights, rooms))
    .sort((a, b) => a.supplierAmountMinor - b.supplierAmountMinor)

  const cheapest  = rates[0]
  const currency  = cheapest?.supplierCurrency ?? 'GBP'
  const minAmount = cheapest?.supplierAmount ?? 0
  const minMinor  = cheapest?.supplierAmountMinor ?? 0

  // Star rating: categoryCode like '5EST' → 5
  const cat = (h.categoryCode as string) ?? ''
  const starMatch = cat.match(/^(\d)/)
  const starRating = starMatch ? parseInt(starMatch[1], 10) : null

  return {
    provider:           'hotelbeds',
    providerHotelCode:  String(h.code ?? ''),
    hotelName:          (h.name as string) ?? 'Unknown Hotel',
    starRating,
    destinationCode:    (h.destinationCode as string) ?? '',
    destinationName:    (h.destinationName as string) ?? null,
    city:               (h.zoneName as string) ?? null,
    country:            null,
    latitude:           (h.latitude as string) ?? null,
    longitude:          (h.longitude as string) ?? null,
    checkIn,
    checkOut,
    nights,
    rooms,
    adults,
    children,
    imageUrls:          [],
    rates,
    supplierCurrency:   currency,
    supplierMinAmount:  minAmount,
    supplierMinAmountMinor: minMinor,
  }
}

// POST /api/admin/travel-search/hotels
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    destination,
    checkIn,
    checkOut,
    adults       = 2,
    children     = 0,
    childAges    = [],
    rooms        = 1,
    currency     = 'GBP',
    sourceMarket = 'GB',
    minCategory  = 3,
  } = body

  if (!destination || !checkIn || !checkOut) {
    return NextResponse.json({ error: 'destination, checkIn, checkOut are required' }, { status: 400 })
  }

  const nights = Math.max(1, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000
  ))

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
      filter: { maxHotels: 25, minCategory, maxRatesPerRoom: 4 },
      currency,
      language: 'ENG',
      reviews: [{ type: 'HOTELBEDS', maxRate: 5, minRate: 1, minReviewCount: 3 }],
      accommodations: ['HOTEL'],
    },
  })

  const rawHotels = (data.hotels?.hotels ?? []) as Array<Record<string, unknown>>
  const searchedAt = new Date().toISOString()

  const offers: NormalizedHotelOffer[] = rawHotels.map(h =>
    normalizeHotel(h, checkIn, checkOut, nights, Number(rooms), Number(adults), Number(children))
  )

  return NextResponse.json({
    offers,
    searchedAt,
    totalOffers: offers.length,
    provider: 'hotelbeds',
    searchParams: { destination, checkIn, checkOut, adults, children, rooms, currency },
  })
}
