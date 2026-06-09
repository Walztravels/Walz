import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

// Called from confirmation page to trigger eSIM order after Stripe payment
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { sessionId } = await req.json().catch(() => ({}))
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId)

  if (checkoutSession.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
  }

  const meta = checkoutSession.metadata ?? {}

  // Prevent double-fulfillment — check if order already exists by stripe payment intent
  const paymentIntentId = String(checkoutSession.payment_intent ?? '')

  // Forward to /api/esim/order to place the eSIM and save to DB
  const origin = req.headers.get('origin') ?? 'https://walztravels.com'
  const orderRes = await fetch(`${origin}/api/esim/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie':        req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      packageCode:     meta.packageCode,
      packageName:     meta.packageName,
      destination:     meta.destination,
      destinationIso2: meta.destinationIso2,
      durationDays:    Number(meta.durationDays),
      dataGb:          meta.dataGb ? Number(meta.dataGb) : null,
      dataLabelStr:    meta.dataLabelStr,
      wholesaleUsd:    Number(meta.wholesaleUsd),
      retailUsd:       Number(meta.retailUsd),
      stripePaymentId: paymentIntentId,
      tripId:          meta.tripId || undefined,
    }),
  })

  const result = await orderRes.json()
  return NextResponse.json(result)
}
