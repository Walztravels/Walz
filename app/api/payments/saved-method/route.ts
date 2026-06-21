import { NextRequest, NextResponse } from 'next/server'
import Stripe                        from 'stripe'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/payments/saved-method
 *
 * Returns the logged-in user's saved card (last4 + brand only).
 * If the user has no saved card, returns { saved: null }.
 *
 * This route intentionally returns NO sensitive card data — only
 * display fields needed to render "Visa ••••4242".
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ saved: null })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: {
      stripeCustomerId:      true,
      stripePaymentMethodId: true,
    },
  })

  if (!user?.stripeCustomerId || !user?.stripePaymentMethodId) {
    return NextResponse.json({ saved: null })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ saved: null })
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const pm     = await stripe.paymentMethods.retrieve(user.stripePaymentMethodId)

    if (!pm.card) return NextResponse.json({ saved: null })

    return NextResponse.json({
      saved: {
        last4:                 pm.card.last4,
        brand:                 pm.card.brand,
        expMonth:              pm.card.exp_month,
        expYear:               pm.card.exp_year,
        stripeCustomerId:      user.stripeCustomerId,
        stripePaymentMethodId: user.stripePaymentMethodId,
      },
    })
  } catch {
    return NextResponse.json({ saved: null })
  }
}
