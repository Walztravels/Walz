import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function POST(req: NextRequest) {
  try {
    const { rateKeys } = await req.json()

    if (!rateKeys?.length) {
      return NextResponse.json({ error: 'rateKeys required' }, { status: 400 })
    }

    // Cert 2.6 — max 10 rate keys per call
    const rooms = rateKeys.slice(0, 10).map((rateKey: string) => ({ rateKey }))

    const data = await hotelbedsRequest('hotel', '/checkrates', {
      method: 'POST',
      body: { rooms },
    })

    return NextResponse.json({
      hotel: data.hotel,
      rooms: data.hotel?.rooms ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
