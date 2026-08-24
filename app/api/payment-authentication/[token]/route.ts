import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// ── GET — load transaction data for the auth page ──────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const tokenHash = hashToken(params.token)

  const tx = await prisma.creditCardAuthorizationTransaction.findUnique({
    where: { authenticationTokenHash: tokenHash },
    include: {
      authorization: {
        select: {
          reference: true, cardholderName: true, cardholderEmail: true,
          serviceType: true, currency: true, cardLast4: true, cardBrand: true,
        },
      },
    },
  }).catch(() => null)

  if (!tx) {
    return NextResponse.json({ error: 'This authentication link is invalid or has expired.' }, { status: 404 })
  }
  if (tx.status === 'paid') {
    return NextResponse.json({ error: 'Payment has already been authenticated and processed.', status: 'paid' }, { status: 200 })
  }
  if (tx.status === 'failed') {
    return NextResponse.json({ error: 'This payment failed and cannot be authenticated.', status: 'failed' }, { status: 410 })
  }
  if (tx.status !== 'authentication_required') {
    return NextResponse.json({ error: 'This link is not currently awaiting authentication.' }, { status: 400 })
  }

  // Get PI client_secret from Stripe
  let clientSecret: string | null = null
  if (tx.stripePaymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(tx.stripePaymentIntentId)
      clientSecret = pi.client_secret
    } catch (err) {
      console.error('[CCA PaymentAuth] PI retrieval failed:', err)
    }
  }

  return NextResponse.json({
    transaction: {
      id:          tx.id,
      amountMinor: Number(tx.amountMinor),
      currency:    tx.currency,
      description: tx.description,
      status:      tx.status,
      requestedAt: tx.requestedAt,
      authorization: tx.authorization,
    },
    clientSecret,
  })
}
