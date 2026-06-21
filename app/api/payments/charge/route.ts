import { NextRequest, NextResponse } from 'next/server'
import Stripe                        from 'stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/payments/charge
 *
 * One-tap charge using a pre-saved payment method.
 * Creates a PaymentIntent with confirm:true — no client confirmation step.
 *
 * Body:
 *   stripeCustomerId      string
 *   stripePaymentMethodId string
 *   amount                number  (smallest currency unit, e.g. pence)
 *   currency              string  (e.g. 'gbp')
 *   metadata              Record<string, string>
 *
 * Returns:
 *   { paymentIntentId, status }   — on success
 *   { error }                     — on failure (Stripe decline, network, etc.)
 *
 * Error contract: this route NEVER creates a Duffel order.
 * The caller must create the Duffel order AFTER this succeeds.
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const {
    stripeCustomerId,
    stripePaymentMethodId,
    amount,
    currency = 'gbp',
    metadata = {},
  } = body as {
    stripeCustomerId:      string
    stripePaymentMethodId: string
    amount:                number
    currency?:             string
    metadata?:             Record<string, string>
  }

  if (!stripeCustomerId || !stripePaymentMethodId || !amount) {
    return NextResponse.json(
      { error: 'stripeCustomerId, stripePaymentMethodId, and amount are required' },
      { status: 400 },
    )
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const intent = await stripe.paymentIntents.create({
      amount:         Math.round(amount),
      currency,
      customer:       stripeCustomerId,
      payment_method: stripePaymentMethodId,
      confirm:        true,                // charge immediately — no client confirm step
      off_session:    true,                // card was saved during a previous on-session payment
      metadata:       { source: 'walztravels_onetap', ...metadata },
      return_url:     'https://walztravels.com/flights/confirmation', // required by Stripe even for off-session
    })

    if (intent.status === 'succeeded') {
      return NextResponse.json({
        paymentIntentId: intent.id,
        status:          intent.status,
      })
    }

    // Requires action (3DS etc.) — unlikely for off_session but handle gracefully
    return NextResponse.json(
      { error: `Payment requires additional action: ${intent.status}`, status: intent.status },
      { status: 402 },
    )
  } catch (err: unknown) {
    // Stripe card decline — surface the decline message to the modal inline
    if (err instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json(
        { error: err.message ?? 'Card declined', declineCode: err.decline_code },
        { status: 402 },
      )
    }

    const msg = err instanceof Error ? err.message : 'Payment failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
