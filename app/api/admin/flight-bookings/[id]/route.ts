import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('FlightBooking')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ booking: data })
  } catch (err) {
    console.error('[admin/flight-bookings/[id] GET]', err)
    return NextResponse.json({ error: 'Failed to fetch booking' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params
    const body     = await req.json()
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('FlightBooking')
      .update({ ...body, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ booking: data })
  } catch (err) {
    console.error('[admin/flight-bookings/[id] PATCH]', err)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}
