import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = 'gbp', metadata } = await req.json()

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        clientSecret: 'pi_dev_mock_secret_test',
        intentId:     'pi_dev_mock',
        source:       'mock',
      })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const intent = await stripe.paymentIntents.create({
      amount:   Math.round(Number(amount)),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: metadata ?? {},
    })

    return NextResponse.json({
      clientSecret: intent.client_secret,
      intentId:     intent.id,
      source:       'stripe',
    })
  } catch (err) {
    console.error('[checkout/intent] Error:', err)
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
}
