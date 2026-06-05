import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'

/**
 * POST /api/booking/create
 *
 * Supports two payment gateways:
 *
 * gateway: "stripe"
 *   → creates a Stripe PaymentIntent and returns clientSecret for
 *     rendering Stripe's PaymentElement on the frontend.
 *
 * gateway: "flutterwave"
 *   → returns a unique tx_ref; Flutterwave handles payment collection
 *     entirely on the frontend with no server round-trip.
 *
 * After payment succeeds, call POST /api/booking/confirm.
 */

const schema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  bookingReference: z.string().min(4).max(20),
  contactEmail: z.string().email(),
  gateway: z.enum(['stripe', 'flutterwave']).default('flutterwave'),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { amount, currency, bookingReference, contactEmail, gateway } = parsed.data
  const txRef = `walz-${bookingReference}-${Date.now()}`

  try {
    if (gateway === 'stripe') {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { bookingReference, contactEmail },
      })

      return NextResponse.json({
        gateway: 'stripe',
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        txRef,
      })
    }

    // Flutterwave — no server setup needed
    return NextResponse.json({ gateway: 'flutterwave', txRef })
  } catch (err) {
    console.error('[Booking Create]', err)
    return NextResponse.json(
      { error: 'Failed to initialise payment. Please try again.' },
      { status: 502 }
    )
  }
}
