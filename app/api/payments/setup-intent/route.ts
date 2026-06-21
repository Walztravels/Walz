import { NextRequest, NextResponse } from 'next/server'
import Stripe                        from 'stripe'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/payments/setup-intent
 *
 * Called after a completed Stripe payment to collect and save the user's card
 * for future one-tap bookings.
 *
 * Body: { email: string; name: string }
 * Returns: { clientSecret, customerId }
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const { email, name } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // Look up the user to get or create their Stripe Customer
  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null)

  let customerId = user?.stripeCustomerId ?? null

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name:     name ?? undefined,
      metadata: { source: 'walztravels_onetap' },
    })
    customerId = customer.id

    // Persist the new customer ID immediately so it's available on the save step
    if (user?.id) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { stripeCustomerId: customerId },
      }).catch(() => {})
    }
  }

  const setupIntent = await stripe.setupIntents.create({
    customer:               customerId,
    payment_method_types:   ['card'],
    usage:                  'off_session',
    metadata: { email, source: 'walztravels_onetap' },
  })

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    customerId,
  })
}
