// POST /api/admin/concierge/book
// Admin-only. Books a concierge service on behalf of a client.
// Airport services: uses ComfortPass balance (no Stripe — admin authorised).
// Private aviation: creates an Aviapages charter quote request.

import { NextRequest, NextResponse }          from 'next/server'
import { getAdminSession }                    from '@/lib/admin-auth'
import { getConfig as getCpConfig }           from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient }                  from '@/lib/concierge/suppliers/comfortpass/client'
import { AviapagesAdapter }                   from '@/lib/concierge/suppliers/aviapages/adapter'
import { isEnabled as isAviapagesEnabled }    from '@/lib/concierge/suppliers/aviapages/config'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'
import { getSupabaseAdmin }                   from '@/lib/supabase'
import type { APAircraftCategory }            from '@/lib/concierge/suppliers/aviapages/types'

export const runtime = 'nodejs'

interface PassengerInput {
  firstName: string
  lastName:  string
  type:      'adult' | 'child' | 'infant'
}

interface AirportServiceBody {
  serviceType:  'lounge' | 'meet-greet' | 'transfer' | 'sleeping-pod' | 'baggage'
  serviceCode:  string
  airportCode:  string
  date:         string
  time?:        string
  flightNumber?: string
  passengers:   PassengerInput[]
  clientName?:  string
  clientEmail:  string
  clientPhone?: string
}

interface PrivateAviationBody {
  serviceType:    'private-aviation'
  from:           string
  to:             string
  date:           string
  returnDate?:    string
  passengers:     number
  category?:      APAircraftCategory
  notes?:         string
  clientName:     string
  clientEmail:    string
  clientPhone?:   string
}

type BookBody = AirportServiceBody | PrivateAviationBody

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: BookBody
  try {
    body = await req.json() as BookBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Generate Walz reference
  let walzRef = `WC-ADMIN-${Date.now().toString(36).toUpperCase()}`
  try {
    const { data } = await supabase.rpc('next_concierge_reference')
    if (data) walzRef = data as string
  } catch { /* use fallback ref */ }

  // ── Private aviation ────────────────────────────────────────────────────────

  if (body.serviceType === 'private-aviation') {
    if (!isAviapagesEnabled()) {
      return NextResponse.json({ error: 'Private aviation is not enabled' }, { status: 503 })
    }
    const b = body as PrivateAviationBody
    if (!b.from || !b.to || !b.date || !b.clientName || !b.clientEmail) {
      return NextResponse.json({ error: 'from, to, date, clientName, clientEmail are required' }, { status: 400 })
    }

    try {
      const adapter = new AviapagesAdapter()
      const conf    = await adapter.submitQuoteRequest({
        from:        b.from,
        to:          b.to,
        date:        b.date,
        returnDate:  b.returnDate,
        passengers:  b.passengers,
        category:    b.category,
        notes:       `[Admin booking by ${session.email}]${b.notes ? '\n' + b.notes : ''}`,
        clientName:  b.clientName,
        clientEmail: b.clientEmail,
        clientPhone: b.clientPhone,
        walzRef,
      })

      // Record in concierge_requests
      await supabase.from('concierge_requests').insert({
        reference:        walzRef,
        jade_session_id:  `admin:${session.email}`,
        status:           'pending',
        fulfilment_mode:  'bespoke',
        intent_fields: {
          service_type:      'private-aviation',
          from_airport:      b.from,
          to_airport:        b.to,
          date:              b.date,
          return_date:       b.returnDate ?? null,
          passengers:        b.passengers,
          aircraft_category: b.category ?? null,
          notes:             b.notes ?? null,
          ap_quote_id:       conf.quoteId,
          booked_by_admin:   session.email,
        },
        client_name:   b.clientName,
        client_email:  b.clientEmail,
        client_phone:  b.clientPhone ?? null,
        internal_notes: `Admin booking by ${session.email}`,
      }).select('id').single()

      return NextResponse.json({ success: true, reference: walzRef, quoteId: conf.quoteId, message: conf.message })
    } catch (err) {
      console.error('[admin/concierge/book] private-aviation failed:', (err as Error).message)
      return NextResponse.json({ error: 'Could not submit charter enquiry. ' + (err as Error).message }, { status: 502 })
    }
  }

  // ── Airport services (lounge, meet-greet, transfer, sleeping-pod, baggage) ──

  const b = body as AirportServiceBody

  if (!b.serviceCode || !b.airportCode || !b.date) {
    return NextResponse.json({ error: 'serviceCode, airportCode, date are required' }, { status: 400 })
  }
  if (!Array.isArray(b.passengers) || b.passengers.length === 0) {
    return NextResponse.json({ error: 'At least one passenger is required' }, { status: 400 })
  }
  if (!b.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.clientEmail)) {
    return NextResponse.json({ error: 'Valid client email is required' }, { status: 400 })
  }

  const cpConfig = getCpConfig()
  if (!cpConfig) {
    return NextResponse.json({ error: 'ComfortPass is not configured' }, { status: 503 })
  }

  const client = new ComfortPassClient(cpConfig)

  // Re-verify price before booking
  let displayPrice = 'See receipt'
  try {
    const cpPrice = await client.getPrice(b.serviceCode)
    const { walzAmount, currency } = await applyWalzMarkup(cpPrice.amount, cpPrice.currency)
    displayPrice = formatDisplayPrice(walzAmount, currency, cpPrice.perPerson)
  } catch { /* price display is non-fatal for admin bookings */ }

  // Look up category
  let catId: string | null = null
  try {
    const { data } = await supabase
      .from('concierge_categories')
      .select('id')
      .eq('slug', 'airport-services')
      .maybeSingle()
    catId = (data as { id: string } | null)?.id ?? null
  } catch { /* non-fatal */ }

  // Insert concierge_request record first
  const { data: reqRecord, error: insertErr } = await supabase
    .from('concierge_requests')
    .insert({
      reference:       walzRef,
      jade_session_id: `admin:${session.email}`,
      category_id:     catId,
      fulfilment_mode: 'instant',
      status:          'pending',
      intent_fields: {
        service_type:    b.serviceType,
        service_code:    b.serviceCode,
        airport_code:    b.airportCode,
        date:            b.date,
        time:            b.time ?? '00:00',
        flight_number:   b.flightNumber ?? '',
        passengers:      b.passengers,
        display_price:   displayPrice,
        booked_by_admin: session.email,
      },
      client_name:    (b.clientName || `${b.passengers[0]?.firstName ?? ''} ${b.passengers[0]?.lastName ?? ''}`.trim()) || null,
      client_email:   b.clientEmail,
      client_phone:   b.clientPhone ?? null,
      internal_notes: `Admin booking by ${session.email}`,
      sla_deadline:   new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (insertErr || !reqRecord) {
    return NextResponse.json({ error: 'Failed to create request record' }, { status: 500 })
  }

  // Submit to ComfortPass using Walz balance
  try {
    const cp = await client.createBooking({
      serviceCode:  b.serviceCode,
      airportCode:  b.airportCode,
      date:         b.date,
      time:         b.time ?? '00:00',
      flightNumber: b.flightNumber ?? 'ADMIN',
      passengers:   b.passengers,
      paymentMethod: 'balance',
      reference:    walzRef,
    })

    // Update request to confirmed
    await supabase
      .from('concierge_requests')
      .update({
        status:     'confirmed',
        intent_fields: {
          ...((reqRecord as unknown as { intent_fields: Record<string, unknown> }).intent_fields ?? {}),
          cp_booking_id:     cp.id,
          cp_booking_number: cp.bookingNumber,
          cp_status:         cp.status,
        },
      })
      .eq('id', (reqRecord as { id: string }).id)

    return NextResponse.json({
      success:       true,
      reference:     walzRef,
      bookingNumber: cp.bookingNumber,
      status:        cp.status,
      displayPrice,
    })
  } catch (err) {
    const message = (err as Error).message
    console.error('[admin/concierge/book] CP booking failed:', message)

    await supabase
      .from('concierge_requests')
      .update({ status: 'cancelled', internal_notes: `Admin booking failed: ${message}` })
      .eq('id', (reqRecord as { id: string }).id)

    return NextResponse.json({ error: `Booking failed: ${message}` }, { status: 502 })
  }
}
