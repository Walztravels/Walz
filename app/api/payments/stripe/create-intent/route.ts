// SECURITY NOTE: This route accepts amount/currency from the browser.
// It is intentionally kept for non-itinerary flows (packages, flight checkout).
//
// ITINERARY PAYMENTS MUST use /api/itinerary-payments/initiate instead.
// That endpoint resolves all amounts from the immutable AcceptanceSnapshot.
// Passing a WALZ-* itinerary reference here is blocked below.

import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  try {
    const { booking_ref, amount, currency, package_title, client_email } =
      await req.json()

    if (!booking_ref || !amount || !currency) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Reject itinerary references — they must use /api/itinerary-payments/initiate
    // so that amounts are resolved server-side from the AcceptanceSnapshot.
    if (typeof booking_ref === 'string' && /^WALZ-[A-Z0-9]{4,}$/i.test(booking_ref)) {
      return NextResponse.json(
        {
          error: 'Itinerary payments must use POST /api/itinerary-payments/initiate. ' +
                 'The browser must not supply the amount for itinerary payments.',
        },
        { status: 400 },
      )
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: client_email || undefined,
      description: `Walz Travels deposit — ${package_title} (Ref: ${booking_ref})`,
      metadata: {
        booking_ref,
        package_title: package_title ?? '',
        type: 'deposit',
      },
    })

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create payment intent'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
