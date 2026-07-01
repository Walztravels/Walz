import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import db from '@/lib/db'

export async function DELETE(req: NextRequest) {
  try {
    const { reference, simulate = false } = await req.json()
    if (!reference) return NextResponse.json({ error: 'reference required' }, { status: 400 })

    const path = `/bookings/en/reference/${reference}${simulate ? '?simulation=true' : ''}`
    const data = await hotelbedsRequest('transfers', path, { method: 'DELETE' })

    if (!simulate) {
      await db.booking.updateMany({
        where: { bookingReference: reference },
        data:  { status: 'CANCELLED' },
      })
    }

    return NextResponse.json({ ok: true, simulation: simulate, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
