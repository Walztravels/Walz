import { NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url         = new URL(req.url)
  const destination = url.searchParams.get('destination')
  const limit       = Number(url.searchParams.get('limit')  ?? '50')
  const offset      = Number(url.searchParams.get('offset') ?? '0')

  if (!destination) {
    return NextResponse.json(
      { error: 'destination query param is required (e.g. LON, DXB, NYC)' },
      { status: 400 },
    )
  }

  try {
    const data = await hotelbedsRequest(
      'activities-cache',
      `/portfolio?destination=${destination}&limit=${limit}&offset=${offset}`,
    )

    const items = Array.isArray(data) ? data : (data?.activities ?? [])

    return NextResponse.json({ ok: true, destination, limit, offset, total: items.length, activities: items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Portfolio request failed' }, { status: 500 })
  }
}
