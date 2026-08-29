// POST /api/itinerary-payments/webhook
//
// Paystack webhook handler for V2 itinerary payments.
// Mirrors the Stripe handler at /api/webhooks/stripe-itinerary/route.ts.
//
// Security:
//   - HMAC-SHA512 signature verified before processing any data
//   - Only events with metadata.source === 'v2_itinerary_payment' are processed
//   - Amount from webhook is verified against accepted_total from metadata
//   - Idempotency enforced at DB level via UNIQUE on provider_reference
//
// Always returns 200: Paystack retries on any non-200 response, which could
// create race conditions. Failures are logged server-side.

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface PaystackEvent {
  event: string
  data: {
    id:        number
    reference: string
    amount:    number   // in kobo/pesewa (minor units)
    currency:  string
    status:    string
    paid_at:   string
    metadata?: {
      source?:              string
      itinerary_reference?: string
      payment_type?:        string
      accepted_total?:      number | string
      currency?:            string  // set server-side by itinerary-payments/initiate
    }
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Read raw body — must happen before any parsing ─────────────────────
  const rawBody = await req.text()

  // ── 2. HMAC-SHA512 signature verification ─────────────────────────────────
  const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
  if (!PS_SECRET) {
    console.error('[paystack-itinerary-webhook] PAYSTACK_SECRET_KEY not set')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const sig = req.headers.get('x-paystack-signature') ?? ''
  const expected = createHmac('sha512', PS_SECRET).update(rawBody).digest('hex')

  const sigValid = (() => {
    try {
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(sig.toLowerCase().padEnd(expected.length, '0').slice(0, expected.length), 'hex')
      // Compare full hex strings to avoid length-mismatch panic
      return expected === sig && a.length === b.length && timingSafeEqual(a, b)
    } catch { return false }
  })()

  if (!sigValid) {
    console.error('[paystack-itinerary-webhook] Signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── 3. Parse event ─────────────────────────────────────────────────────────
  let event: PaystackEvent
  try {
    event = JSON.parse(rawBody) as PaystackEvent
  } catch {
    console.error('[paystack-itinerary-webhook] Failed to parse event body')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // ── 4. Filter: only process charge.success for itinerary payments ──────────
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true, ignored: true })
  }

  const { data } = event
  const meta = data.metadata

  if (meta?.source !== 'v2_itinerary_payment') {
    return NextResponse.json({ received: true, ignored: true })
  }

  const itineraryReference = meta?.itinerary_reference
  const paymentType        = meta?.payment_type
  if (!itineraryReference || !paymentType) {
    console.error('[paystack-itinerary-webhook] Missing metadata fields:', data.reference)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // ── 5. Amount + currency verification ────────────────────────────────────
  // Verify the amount Paystack reports matches the accepted_total from metadata.
  // Paystack amounts are in minor units (kobo/pesewa); accepted_total is in major units.
  const acceptedTotal = Number(meta?.accepted_total)
  if (!Number.isNaN(acceptedTotal) && acceptedTotal > 0) {
    const expectedMinor = Math.round(acceptedTotal * 100)
    if (data.amount < expectedMinor) {
      console.error('[paystack-itinerary-webhook] Amount mismatch — expected', expectedMinor, 'got', data.amount, 'ref:', data.reference)
      return NextResponse.json({ received: true }, { status: 200 })
    }
  }

  // Currency integrity check: the currency Paystack reports must match the currency
  // stamped into the transaction metadata by the server at initialization time.
  const expectedCurrency = meta?.currency?.toUpperCase()
  const webhookCurrency  = data.currency?.toUpperCase()
  if (expectedCurrency && webhookCurrency && webhookCurrency !== expectedCurrency) {
    console.error(
      `[paystack-itinerary-webhook] Currency mismatch — webhook currency ${webhookCurrency} ≠ expected ${expectedCurrency} — ref: ${data.reference}`,
    )
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // ── 6. Upsert payment record ──────────────────────────────────────────────
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    console.error('[paystack-itinerary-webhook] Supabase not configured')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const amountMajor = data.amount / 100

  const { error } = await supabase
    .from('itinerary_payments')
    .upsert(
      {
        itinerary_id:       itineraryReference,  // reference string, matches Stripe webhook pattern
        acceptance_version: 2,
        amount:             amountMajor,
        currency:           data.currency.toUpperCase(),
        type:               paymentType,
        method:             'PAYSTACK',
        status:             'PAID',
        provider_reference: data.reference,      // UNIQUE — idempotency key
        paid_at:            data.paid_at ?? new Date().toISOString(),
        notes:              `Paystack charge ${data.reference} (id: ${data.id})`,
      },
      {
        onConflict:       'provider_reference',
        ignoreDuplicates: false,
      },
    )

  if (error) {
    console.error('[paystack-itinerary-webhook] DB upsert error:', error.message)
  } else {
    console.log('[paystack-itinerary-webhook] Recorded payment for', itineraryReference, data.reference)
  }

  // Always return 200 — Paystack retries on non-200, which causes race conditions.
  return NextResponse.json({ received: true })
}
