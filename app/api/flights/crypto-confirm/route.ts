import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Called by /flights/crypto-return when the user lands back from NOWPayments.
// Marks the booking as pending_review (payment initiated). Idempotent.
export async function POST(req: NextRequest) {
  const { ref } = await req.json().catch(() => ({}))
  if (!ref || typeof ref !== 'string') {
    return NextResponse.json({ error: 'Missing ref' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('FlightBooking')
    .update({ status: 'pending_review' })
    .eq('reference', ref)
    .in('status', ['awaiting_payment', 'pending_review'])
    .select('reference, clientEmail, clientName, searchedOrigin, searchedDest, departDate')
    .single()

  if (error || !data) {
    console.error('[flights/crypto-confirm] error:', error, 'ref:', ref)
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  return NextResponse.json({ reference: data.reference, success: true })
}
