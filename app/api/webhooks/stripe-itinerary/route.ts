// app/api/webhooks/stripe-itinerary/route.ts
//
// Stripe webhook handler for V2 itinerary payments.
// Listens for payment_intent.succeeded events where
// metadata.source === 'v2_itinerary_payment'.
//
// Idempotency: the itinerary_payments table has a UNIQUE index on
// provider_reference, so duplicate webhook deliveries for the same
// PaymentIntent are rejected at the DB level rather than double-inserted.

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getSupabaseAdmin } from '@/lib/supabase'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Raw body is required for webhook signature verification.
// Next.js App Router: we must read the body before any parsing.
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_ITINERARY_WEBHOOK_SECRET
    ?? process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[stripe-itinerary-webhook] STRIPE_ITINERARY_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? '', webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[stripe-itinerary-webhook] Signature verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature error: ${msg}` }, { status: 400 })
  }

  // Only handle payment_intent.succeeded for itinerary payments
  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true, ignored: true })
  }

  const intent = event.data.object as Stripe.PaymentIntent

  // Only process events originating from /api/itinerary-payments/initiate
  if (intent.metadata?.source !== 'v2_itinerary_payment') {
    return NextResponse.json({ received: true, ignored: true })
  }

  const itineraryReference = intent.metadata?.itinerary_reference
  const paymentType        = intent.metadata?.payment_type
  const currency           = intent.metadata?.currency ?? intent.currency.toUpperCase()

  if (!itineraryReference || !paymentType) {
    console.error('[stripe-itinerary-webhook] Missing metadata:', intent.id)
    return NextResponse.json({ error: 'Missing itinerary metadata' }, { status: 400 })
  }

  // amount is in smallest currency unit (pence for GBP); convert to major units
  const amountMajor = intent.amount / 100

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    console.error('[stripe-itinerary-webhook] Supabase not configured')
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Upsert the payment record — ON CONFLICT on provider_reference means
  // duplicate webhook deliveries update status rather than inserting twice.
  const { error } = await supabase
    .from('itinerary_payments')
    .upsert(
      {
        itinerary_id:       itineraryReference,   // TEXT CUID; stored as reference string
        acceptance_version: 2,
        amount:             amountMajor,
        currency:           currency.toUpperCase(),
        type:               paymentType,
        method:             'STRIPE',
        status:             'PAID',
        provider_reference: intent.id,
        paid_at:            new Date().toISOString(),
        notes:              `Stripe PaymentIntent ${intent.id}`,
      },
      {
        onConflict:       'provider_reference',
        ignoreDuplicates: false,
      }
    )

  if (error) {
    console.error('[stripe-itinerary-webhook] DB insert error:', error)
    // Return 200 to prevent Stripe from retrying — log the failure instead.
    // A 5xx would cause Stripe to retry, potentially creating race conditions.
    return NextResponse.json({ received: true, dbError: error.message }, { status: 200 })
  }

  console.log('[stripe-itinerary-webhook] Recorded payment for', itineraryReference, intent.id)
  return NextResponse.json({ received: true })
}
