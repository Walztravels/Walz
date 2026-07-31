import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { getSupabaseAdmin }   from '@/lib/supabase'
import { hotelbedsRequest }   from '@/lib/hotelbeds'
import { duffelPost }         from '@/lib/duffel/client'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { bookingId?: string }
  if (!body.bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: booking, error: fetchErr } = await supabase
    .from('dummy_bookings')
    .select('*')
    .eq('id', body.bookingId)
    .single()

  if (fetchErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.cancelled_at) return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  let cancelled  = false
  let cancelNote = ''

  try {
    if (booking.type === 'HOTEL' && booking.provider === 'hotelbeds') {
      await hotelbedsRequest('hotel', `/bookings/${booking.provider_ref}`, {
        method: 'DELETE',
        params: { language: 'ENG', cancellationFlag: 'CANCELLATION' },
      })
      cancelled  = true
      cancelNote = `Hotelbeds booking ${booking.provider_ref} cancelled`
    } else if (booking.type === 'FLIGHT' && booking.provider === 'duffel') {
      interface DuffelCancResp { data: { id: string } }
      const cancResp = await duffelPost<DuffelCancResp>(
        '/air/order_cancellations',
        { data: { order_id: booking.order_id } },
      )
      await duffelPost(
        `/air/order_cancellations/${cancResp.data.id}/actions/confirm`,
        {},
      )
      cancelled  = true
      cancelNote = `Duffel order ${booking.order_id} cancelled (cancellation ${cancResp.data.id})`
    } else {
      return NextResponse.json({ error: `Unknown provider: ${booking.provider}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Cancel failed: ${String(e)}`, cancelled: false }, { status: 500 })
  }

  await supabase
    .from('dummy_bookings')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', body.bookingId)

  return NextResponse.json({ cancelled: true, note: cancelNote })
}
