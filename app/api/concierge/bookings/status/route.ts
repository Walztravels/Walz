// Public booking status endpoint — accessible by Walz reference (no auth required).
// The reference acts as the "secret" for this resource.
// Returns only customer-safe fields — no supplier amounts, no internal IDs.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const runtime = 'nodejs'

interface ConciergeRequestRow {
  id:            string
  reference:     string
  status:        string
  intent_fields: Record<string, unknown>
  client_name:   string | null
  created_at:    string
}

interface CPBookingRow {
  cp_booking_id:     string | null
  cp_booking_number: number | null
  cp_status:         string | null
  voucher_url:       string | null
  voucher_status:    string | null
  submission_state:  string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ref = searchParams.get('ref')?.trim()

  if (!ref) {
    return NextResponse.json({ error: 'ref is required' }, { status: 400 })
  }

  // Simple format guard: WC-XXXX or WLZ-XXXX
  if (!/^(WC|WLZ)-/i.test(ref)) {
    return NextResponse.json({ error: 'Invalid reference format' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: request, error } = await supabase
    .from('concierge_requests')
    .select('id, reference, status, intent_fields, client_name, created_at')
    .eq('reference', ref)
    .maybeSingle()

  if (error) {
    console.error('[/api/concierge/bookings/status]', error.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
  if (!request) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const req_ = request as ConciergeRequestRow
  const fields = req_.intent_fields ?? {}

  // Try to get CP booking data (may not exist yet if payment hasn't confirmed)
  const { data: cpBooking } = await supabase
    .from('comfortpass_bookings')
    .select('cp_booking_id, cp_booking_number, cp_status, voucher_url, voucher_status, submission_state')
    .eq('request_id', req_.id)
    .maybeSingle()

  const cp = cpBooking as CPBookingRow | null

  return NextResponse.json({
    reference:     req_.reference,
    status:        req_.status,
    serviceName:   fields.service_type
      ? SERVICE_NAME_MAP[fields.service_type as string] ?? 'Airport Service'
      : 'Airport Service',
    airportCode:   fields.airport_code ?? null,
    date:          fields.date         ?? null,
    time:          fields.time         ?? null,
    flightNumber:  fields.flight_number ?? null,
    passengerCount: Array.isArray(fields.passengers) ? (fields.passengers as unknown[]).length : null,
    displayPrice:  fields.display_price ?? null,
    createdAt:     req_.created_at,

    // CP booking details — only present once payment confirmed and CP booking submitted
    cpStatus:      cp?.cp_status        ?? null,
    bookingNumber: cp?.cp_booking_number ?? null,
    voucherUrl:    cp?.voucher_status === 'ready' ? cp.voucher_url : null,
    voucherReady:  cp?.voucher_status === 'ready',
    submissionState: cp?.submission_state ?? null,
  })
}

const SERVICE_NAME_MAP: Record<string, string> = {
  'lounge':       'Airport Lounge',
  'meet-greet':   'Meet & Greet',
  'transfer':     'Airport Transfer',
  'sleeping-pod': 'Sleeping Pods',
  'baggage':      'Baggage Delivery',
}
