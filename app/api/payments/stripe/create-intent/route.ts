import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  try {
    const { booking_ref, amount, currency, package_title, client_email } =
      await req.json()

    if (!booking_ref || !amount || !currency) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
