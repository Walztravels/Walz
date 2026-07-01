import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ hotels: [] })

  try {
    const data = await hotelbedsRequest('content', '/hotels', {
      params: { name: q, fields: 'basic', language: 'ENG', from: '1', to: '8' },
    })

    console.log('[transfer hotel-search] raw[0]:', JSON.stringify(data?.hotels?.[0] ?? null))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = (Array.isArray(data?.hotels) ? data.hotels : []).flatMap((h: any) => {
      const rawName = typeof h.name === 'object' ? (h.name?.content ?? '') : (h.name ?? '')
      // Discard Hotelbeds test-environment stub entries (literally named "Hotel" or too short)
      if (!rawName || rawName.toLowerCase() === 'hotel' || rawName.length < 5) return []
      const rawCity =
        typeof h.city === 'object'
          ? (h.city?.content ?? h.destinationName ?? '')
          : (h.destinationName ?? '')
      return [{
        code:    String(h.code),
        type:    'ATLAS_HOTEL' as const,
        name:    rawName,
        city:    rawCity,
        country: h.countryCode ?? '',
      }]
    })

    return NextResponse.json({ hotels })
  } catch {
    return NextResponse.json({ hotels: [] })
  }
}
