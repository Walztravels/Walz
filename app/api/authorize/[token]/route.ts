import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

// GET — return public details for the authorization page (no admin auth needed)
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const auth = await prisma.cardAuthorization.findUnique({
    where: { token: params.token },
    select: {
      id:          true,
      status:      true,
      amount:      true,
      currency:    true,
      description: true,
      clientName:  true,
      expiresAt:   true,
      stripePaymentIntentId: true,
    },
  })

  if (!auth) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  if (['captured', 'released', 'expired', 'cancelled'].includes(auth.status)) {
    return NextResponse.json({
      error: `This authorization link is no longer active (${auth.status})`,
      status: auth.status,
    }, { status: 410 })
  }

  // Return the Stripe client secret so the client can complete the payment element
  let clientSecret: string | null = null
  if (auth.stripePaymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(auth.stripePaymentIntentId)
      clientSecret = pi.client_secret
    } catch {
      // If PI retrieval fails, still show the page
    }
  }

  return NextResponse.json({
    amount:      auth.amount,
    currency:    auth.currency,
    description: auth.description,
    clientName:  auth.clientName,
    status:      auth.status,
    expiresAt:   auth.expiresAt,
    clientSecret,
  })
}
