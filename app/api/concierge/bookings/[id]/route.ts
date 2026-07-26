// GET booking status by CP booking ID.
// Returns normalised WalzBookingRecord — supplier amounts excluded.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { id }    = await params
  const walzRef   = req.nextUrl.searchParams.get('ref') ?? id
  const adapter   = new ComfortPassAdapter()

  try {
    const booking = await adapter.getBookingStatus(id, walzRef)
    return NextResponse.json({ booking })
  } catch (err) {
    console.error('[/api/concierge/bookings/[id]]', (err as Error).message)
    return NextResponse.json({ error: 'Could not retrieve booking' }, { status: 502 })
  }
}

// PATCH — admin-triggered status poll + DB update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { id }     = await params
  const body       = await req.json() as { requestId?: string }
  const requestId  = body.requestId

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 422 })
  }

  const adapter = new ComfortPassAdapter()
  await adapter.pollAndUpdateBooking(id, requestId)

  return NextResponse.json({ ok: true })
}
