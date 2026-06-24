import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id }   = await params
    const body     = await req.json()
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('FlightBooking')
      .update({
        status:     'cancelled',
        adminNotes: body.reason ?? body.adminNote ?? null,
        updatedAt:  new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, status: 'cancelled', booking: data })
  } catch (err) {
    console.error('[cancel-booking]', err)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
