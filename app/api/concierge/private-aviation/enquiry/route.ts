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

  // Record the lead in Supabase first — this always succeeds regardless of Aviapages state
  const intentFields: Record<string, unknown> = {
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
    client_name:       clientName,
  }

  await supabase.from('concierge_requests').insert({
    reference:    walzRef,
    status:       'pending',
    intent_fields: intentFields,
    client_name:  clientName,
    client_email: clientEmail,
    client_phone: clientPhone ?? null,
  }).select('id').single()

  // Submit to Aviapages — if this fails the lead is still saved and team can follow up
  try {
    const adapter = new AviapagesAdapter()
    const confirmation = await adapter.submitQuoteRequest({
      from, to, date, returnDate, passengers, category, notes,
      clientName, clientEmail, clientPhone,
      walzRef,
    })

    // Update the record with the Aviapages quote ID
    await supabase.from('concierge_requests')
      .update({ intent_fields: { ...intentFields, ap_quote_id: confirmation.quoteId } })
      .eq('reference', walzRef)

    return NextResponse.json({
      reference: walzRef,
      quoteId:   confirmation.quoteId,
      message:   confirmation.message,
    })
  } catch (err) {
    const msg = (err as Error).message ?? ''
    console.error('[PrivateAviation/enquiry] Aviapages submission failed:', msg)

    // Profile incomplete on Aviapages account — lead is saved, team follows up manually
    if (msg.includes('400') || msg.includes('given_name') || msg.includes('family_name')) {
      console.warn('[PrivateAviation/enquiry] Aviapages account profile incomplete — enquiry saved for manual follow-up')
      return NextResponse.json({
        reference: walzRef,
        message:   'Your charter enquiry has been received. Our private aviation team will contact you within 2 hours with tailored options and pricing.',
      })
    }

    // Any other Aviapages error — lead is still saved
    return NextResponse.json({
      reference: walzRef,
      message:   'Your charter enquiry has been received. Our private aviation team will contact you within 2 hours with tailored options and pricing.',
    })
  }
}
