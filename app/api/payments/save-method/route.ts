import { NextRequest, NextResponse } from 'next/server'
import Stripe                        from 'stripe'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/payments/save-method
 *
 * Called after SetupIntent is confirmed on the client. Retrieves the
 * payment method from Stripe, then persists only the PM ID + Customer ID
 * to the user's row — never the raw card number.
 *
 * Body: { setupIntentId: string; email: string }
 * Returns: { last4: string; brand: string }
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const { setupIntentId, email } = await req.json().catch(() => ({}))
  if (!setupIntentId || !email) {
    return NextResponse.json({ error: 'setupIntentId and email required' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
  const pmId        = setupIntent.payment_method as string | null

  if (!pmId) {
    return NextResponse.json({ error: 'No payment method on SetupIntent' }, { status: 400 })
  }

  const pm   = await stripe.paymentMethods.retrieve(pmId)
  const card = pm.card
  if (!card) {
    return NextResponse.json({ error: 'SetupIntent payment method is not a card' }, { status: 400 })
  }

  // Save to DB — only the IDs, brand, and last4 (no raw card data)
  await prisma.user.update({
    where: { email },
    data: {
      stripePaymentMethodId: pmId,
      stripeCustomerId:      setupIntent.customer as string,
    },
  }).catch(() => {
    // User might be a guest — non-fatal
  })

  return NextResponse.json({
    last4: card.last4,
    brand: card.brand,
    stripePaymentMethodId: pmId,
    stripeCustomerId:      setupIntent.customer as string,
  })
}
