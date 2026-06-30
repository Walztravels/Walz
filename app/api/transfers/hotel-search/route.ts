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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = (data.hotels ?? []).map((h: any) => ({
      code:    String(h.code),
      name:    typeof h.name === 'object' ? (h.name?.content ?? 'Hotel') : (h.name ?? 'Hotel'),
      city:    typeof h.city === 'object' ? (h.city?.content ?? '') : (h.destinationName ?? ''),
      country: h.countryCode ?? '',
    }))

    return NextResponse.json({ hotels })
  } catch {
    return NextResponse.json({ hotels: [] })
  }
}
