import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const status   = req.nextUrl.searchParams.get('status')
    const limit    = Number(req.nextUrl.searchParams.get('limit') ?? 200)

    let query = supabase
      .from('FlightBooking')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ bookings: data ?? [] })
  } catch (err) {
    console.error('[admin/flight-bookings GET]', err)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}
