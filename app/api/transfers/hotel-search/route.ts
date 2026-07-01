import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ hotels: [] })

  try {
    // Transfer Cache API — uses transfers credentials, returns ATLAS_HOTEL codes
    // compatible with the Transfers Booking API. Does not support name-based
    // filtering; results are filtered client-side by the search query.
    const data = await hotelbedsRequest('transfers-cache', '/hotels', {
      params: {
        fields:   ['code', 'name', 'city', 'countryCode', 'destinationCode'],
        language: 'ENG',
        limit:    '20',
      },
    })

    console.log('[transfer hotel-search] raw[0]:', JSON.stringify(data?.hotels?.[0] ?? null))

    const qLower = q.toLowerCase()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = (Array.isArray(data?.hotels) ? data.hotels : []).flatMap((h: any) => {
      const rawName = String(h.name ?? '').trim()
      const rawCity = String(h.city ?? '').trim()
      if (!rawName || rawName.toLowerCase() === 'hotel' || rawName.length < 5) return []

      const nameLower = rawName.toLowerCase()
      const cityLower = rawCity.toLowerCase()
      const queryWords = qLower.split(/\s+/)
      const matches = queryWords.some(w => nameLower.includes(w) || cityLower.includes(w))
      if (!matches) return []

      return [{
        code:    String(h.code),
        type:    'ATLAS_HOTEL' as const,
        name:    rawName,
        city:    rawCity,
        country: String(h.countryCode ?? ''),
      }]
    }).slice(0, 8)

    return NextResponse.json({ hotels })
  } catch {
    return NextResponse.json({ hotels: [] })
  }
}
