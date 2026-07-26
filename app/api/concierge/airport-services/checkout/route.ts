// Airport services checkout — creates a Walz booking order and Stripe Checkout Session.
// Price is re-verified server-side (prevents client-side price manipulation).
// ComfortPass booking is NOT created here — only after Stripe payment confirms
// via the webhook at /api/webhooks/stripe.

import { NextRequest, NextResponse }  from 'next/server'
import { getConfig }                  from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient }          from '@/lib/concierge/suppliers/comfortpass/client'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'
import { stripe }                     from '@/lib/stripe'
import { getSupabaseAdmin }           from '@/lib/supabase'

export const runtime = 'nodejs'

const SERVICE_LABELS: Record<string, string> = {
  'lounge':       'Airport Lounge',
  'meet-greet':   'Meet & Greet',
  'transfer':     'Airport Transfer',
  'sleeping-pod': 'Sleeping Pods',
  'baggage':      'Baggage Delivery',
}

const VALID_TYPES = new Set(['lounge', 'meet-greet', 'transfer', 'sleeping-pod', 'baggage'])

interface PassengerInput {
  firstName: string
  lastName:  string
  type:      'adult' | 'child' | 'infant'
}

interface BaggageItem {
  code:     string
  quantity: number
}

export async function POST(req: NextRequest) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    type,
    serviceCode,
    airportCode,
    date,
    time,
    flightNumber,
    passengers,
    leadEmail,
    leadPhone,
    baggageItems,
  } = body as {
    type:         string
    serviceCode:  string
    airportCode:  string
    date:         string
    time?:        string
    flightNumber?: string
    passengers:   PassengerInput[]
    leadEmail:    string
    leadPhone?:   string
    baggageItems?: BaggageItem[]
  }

  // Validation
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid service type' }, { status: 400 })
  }
  if (!serviceCode || !airportCode || !date) {
    return NextResponse.json({ error: 'serviceCode, airportCode, and date are required' }, { status: 400 })
  }
  if (!Array.isArray(passengers) || passengers.length === 0) {
    return NextResponse.json({ error: 'At least one passenger is required' }, { status: 400 })
  }
  if (!leadEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const client = new ComfortPassClient(config)

  // Re-verify live price (prevents stale-price exploits)
  let unitAmount:  number  // Walz price per unit (cents for Stripe)
  let quantity:    number  // Stripe line-item quantity
  let currency:    string
  let displayPrice: string

  try {
    if (type === 'baggage' && Array.isArray(baggageItems) && baggageItems.length > 0) {
      const quote = await client.getBaggageQuote({
        serviceCode,
        passengers: passengers.map(p => ({ type: p.type, firstName: p.firstName, lastName: p.lastName })),
        baggage:    baggageItems,
      })
      const { walzAmount, currency: curr } = await applyWalzMarkup(quote.total, quote.currency)
      currency     = curr
      displayPrice = formatDisplayPrice(walzAmount, currency, false)
      unitAmount   = Math.round(walzAmount * 100)
      quantity     = 1
    } else {
      const cpPrice = await client.getPrice(serviceCode, { passengers: passengers.length, date })
      const { walzAmount, currency: curr } = await applyWalzMarkup(cpPrice.amount, cpPrice.currency)
      currency     = curr
      displayPrice = formatDisplayPrice(walzAmount, currency, cpPrice.perPerson)
      quantity     = cpPrice.perPerson ? passengers.length : 1
      unitAmount   = Math.round(walzAmount * 100)
    }
  } catch (err) {
    console.error('[Checkout] Price fetch failed:', (err as Error).message)
    return NextResponse.json({ error: 'Could not verify service price. Please try again.' }, { status: 502 })
  }

  // Generate Walz reference
  const supabase = getSupabaseAdmin()
  let reference: string
  try {
    const { data: refData } = await supabase.rpc('next_concierge_reference')
    reference = (refData as string | null) ?? `WC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`
  } catch {
    reference = `WC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`
  }

  // Load airport-services category ID (best-effort — null if not seeded yet)
  let cat: { id: string } | null = null
  try {
    const { data } = await supabase
      .from('concierge_categories')
      .select('id')
      .eq('slug', 'airport-services')
      .maybeSingle()
    cat = data as { id: string } | null
  } catch { /* non-fatal */ }

  // Store full booking intent in concierge_requests (fetched by webhook after payment)
  const intentFields = {
    service_type:  type,
    service_code:  serviceCode,
    airport_code:  airportCode,
    date,
    time:          time ?? '00:00',
    flight_number: flightNumber ?? '',
    passengers,
    baggage_items: baggageItems ?? null,
    lead_email:    leadEmail,
    lead_phone:    leadPhone ?? null,
    display_price: displayPrice,
  }

  const { data: reqRecord, error: insertError } = await supabase
    .from('concierge_requests')
    .insert({
      reference,
      jade_session_id:  'direct_booking',
      chatwoot_conv_id: null,
      category_id:      (cat as { id: string } | null)?.id ?? null,
      fulfilment_mode:  'instant',
      status:           'pending_payment',
      intent_fields:    intentFields,
      client_name:      `${passengers[0].firstName} ${passengers[0].lastName}`,
      client_email:     leadEmail,
      client_phone:     leadPhone ?? null,
      sla_deadline:     new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !reqRecord) {
    console.error('[Checkout] Failed to insert concierge_request:', insertError?.message)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  const requestId = (reqRecord as { id: string }).id

  // Create Stripe Checkout Session
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://walztravels.com'

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     currency.toLowerCase(),
          product_data: { name: `Walz Concierge — ${SERVICE_LABELS[type] ?? 'Airport Service'} at ${airportCode}` },
          unit_amount:  unitAmount,
        },
        quantity,
      }],
      customer_email: leadEmail,
      metadata: {
        type:         'concierge_airport',
        request_id:   requestId,
        walz_ref:     reference,
        service_code: serviceCode,
        airport_code: airportCode,
        service_type: type,
      },
      success_url: `${siteUrl}/concierge/bookings/${reference}?paid=1`,
      cancel_url:  `${siteUrl}/concierge/airport-services/${type}?cancelled=1`,
    })

    return NextResponse.json({ reference, checkoutUrl: session.url })
  } catch (err) {
    console.error('[Checkout] Stripe session creation failed:', (err as Error).message)
    // Clean up the pending request so it doesn't accumulate
    void supabase.from('concierge_requests').update({ status: 'cancelled' }).eq('id', requestId)
    return NextResponse.json({ error: 'Payment setup failed. Please try again.' }, { status: 502 })
  }
}
