import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ hotels: [] })

  try {
    // Transfer Cache API — uses transfer credentials (not hotel credentials).
    // Does not support name-based filtering; fetch a broad batch and filter client-side.
    const data = await hotelbedsRequest('transfer-cache', '/hotels', {
      params: {
        fields:   'all',
        language: 'ENG',
        offset:   '1',
        limit:    '100',
      },
    })

    console.log('[transfer hotel-search] raw[0]:', JSON.stringify(data?.hotels?.[0] ?? null))

    const hotels = (Array.isArray(data?.hotels) ? data.hotels : []).flatMap((h: any) => {
      const rawName = typeof h.name === 'object' ? (h.name?.content ?? '') : (h.name ?? '')
      if (!rawName || rawName.toLowerCase() === 'hotel' || rawName.length < 5) return []
      // Filter by search query (name or city)
      if (!rawName.toLowerCase().includes(q.toLowerCase()) &&
          !(h.city ?? '').toLowerCase().includes(q.toLowerCase())) return []
      return [{
        code:    String(h.code),
        type:    'ATLAS' as const,
        name:    rawName,
        city:    h.city ?? h.destinationCode ?? '',
        country: h.countryCode ?? '',
      }]
    }).slice(0, 8)

    return NextResponse.json({ hotels })
  } catch {
    return NextResponse.json({ hotels: [] })
  }
}
