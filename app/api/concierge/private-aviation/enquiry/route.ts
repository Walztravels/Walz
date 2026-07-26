// POST /api/concierge/private-aviation/enquiry
//
// Submits a charter quote request to Aviapages and records the lead.
// NOTE: Aviapages free tier allows 30 charter_quote_requests.
// This is a "request to book" flow — no Stripe checkout, no instant booking.
// The Walz private aviation team follows up with tailored pricing.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }        from '@/lib/concierge/suppliers/aviapages/config'
import { AviapagesAdapter } from '@/lib/concierge/suppliers/aviapages/adapter'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { APAircraftCategory } from '@/lib/concierge/suppliers/aviapages/types'

export const dynamic = 'force-dynamic'

interface EnquiryBody {
  from:          string
  to:            string
  date:          string
  returnDate?:   string
  passengers:    number
  category?:     APAircraftCategory
  notes?:        string
  clientName:    string
  clientEmail:   string
  clientPhone?:  string
}

export async function POST(req: NextRequest) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Private aviation is not available.' }, { status: 503 })
  }

  let body: EnquiryBody
  try {
    body = await req.json() as EnquiryBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { from, to, date, returnDate, passengers, category, notes, clientName, clientEmail, clientPhone } = body

  // Validate required fields
  const missing = (['from', 'to', 'date', 'clientName', 'clientEmail'] as const)
    .filter(k => !body[k])
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 })
  }

  if (passengers < 1 || passengers > 500) {
    return NextResponse.json({ error: 'Invalid passenger count.' }, { status: 400 })
  }

  // Generate Walz reference
  const supabase = getSupabaseAdmin()
  let walzRef = `WJT-${Date.now().toString(36).toUpperCase()}`
  try {
    const { data } = await supabase.rpc('next_concierge_reference')
    if (data) walzRef = data as string
  } catch { /* fallback ref used */ }

  try {
    const adapter = new AviapagesAdapter()
    const confirmation = await adapter.submitQuoteRequest({
      from, to, date, returnDate, passengers, category, notes,
      clientName, clientEmail, clientPhone,
      walzRef,
    })

    // Record enquiry in concierge_requests as a lead
    await supabase.from('concierge_requests').insert({
      reference:    walzRef,
      status:       'pending',
      intent_fields: {
        service_type:      'private-aviation',
        from_airport:      from,
        to_airport:        to,
        date,
        return_date:       returnDate ?? null,
        passengers,
        aircraft_category: category ?? null,
        notes:             notes ?? null,
        lead_email:        clientEmail,
        lead_phone:        clientPhone ?? null,
        ap_quote_id:       confirmation.quoteId,
      },
    }).select('id').single()

    return NextResponse.json({
      reference:   walzRef,
      quoteId:     confirmation.quoteId,
      message:     confirmation.message,
    })
  } catch (err) {
    console.error('[PrivateAviation/enquiry]', (err as Error).message)
    return NextResponse.json({
      error: 'Could not submit your enquiry. Please contact us on WhatsApp or try again.',
    }, { status: 502 })
  }
}
