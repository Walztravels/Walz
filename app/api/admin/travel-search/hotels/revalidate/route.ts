import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { hasPermission }             from '@/lib/admin/permissions'
import { hotelbedsRequest }          from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

// POST /api/admin/travel-search/hotels/revalidate
// Calls Hotelbeds /checkrates to confirm rate key is still valid
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { rateKeys }: { rateKeys: string[] } = body
  if (!Array.isArray(rateKeys) || rateKeys.length === 0) {
    return NextResponse.json({ error: 'rateKeys (array) is required' }, { status: 400 })
  }

  let data: Record<string, unknown>
  try {
    data = await hotelbedsRequest('hotel', '/checkrates', {
      method: 'POST',
      body: { rooms: rateKeys.map(rateKey => ({ rateKey })) },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('400') || msg.includes('INVALID_RATE')) {
      return NextResponse.json(
        { available: false, reason: 'rate_invalid', message: 'One or more rates are no longer available.' },
        { status: 200 },
      )
    }
    throw err
  }

  const hotels = data.hotels as Array<Record<string, unknown>> | undefined
  const hotel  = (data.hotel ?? (hotels?.[0]) ?? {}) as Record<string, unknown>
  const rooms = (hotel.rooms as Array<Record<string, unknown>>) ?? []

  const revalidatedRates = rooms.flatMap(r =>
    ((r.rates as Array<Record<string, unknown>>) ?? []).map(rate => {
      const net    = parseFloat(String(rate.net ?? rate.sellingRate ?? 0))
      const cur    = (rate.currency as string) ?? 'GBP'
      return {
        rateKey:            (rate.rateKey as string) ?? '',
        roomCode:           (r.code as string) ?? null,
        roomName:           (r.name as string) ?? null,
        boardCode:          (rate.boardCode as string) ?? null,
        net,
        netMinor:           Math.round(net * 100),
        currency:           cur,
        isRefundable:       (rate.rateClass as string) !== 'NOR',
        cancellationPolicy: null,
      }
    })
  )

  return NextResponse.json({
    available:     revalidatedRates.length > 0,
    revalidatedAt: new Date().toISOString(),
    rates:         revalidatedRates,
    hotelName:     (hotel.name as string) ?? null,
  })
}
