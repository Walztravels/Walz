import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { getVisaConfig } from '@/lib/visa-config'
import { sendVisaApplicationConfirmation, sendVisaAdminNotification } from '@/lib/email-visa'

type Params = { params: { id: string } }

// POST /api/visa-application/[id]/payment
// Creates a Stripe PaymentIntent for the Walz service fee
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const app = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.serviceFeePaid) return NextResponse.json({ error: 'Already paid' }, { status: 409 })

  const config = getVisaConfig(app.destinationIso2)
  if (!config) return NextResponse.json({ error: 'Country not configured' }, { status: 400 })

  const amountCents = config.serviceFeeUsd * 100

  // Re-use existing PaymentIntent if one exists
  if (app.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(app.stripePaymentIntentId)
    if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation') {
      return NextResponse.json({ clientSecret: existing.client_secret, amount: config.serviceFeeUsd })
    }
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: {
      applicationId: app.id,
      referenceNumber: app.referenceNumber,
      userId: session.user.id,
      destination: app.destinationIso2,
    },
    description: `Walz Visa Service Fee — ${config.name} (${app.referenceNumber})`,
    receipt_email: app.email ?? session.user.email ?? undefined,
  })

  await prisma.visaApplication.update({
    where: { id: app.id },
    data: { stripePaymentIntentId: paymentIntent.id },
  })

  return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount: config.serviceFeeUsd })
}

// POST /api/visa-application/[id]/payment/confirm — called after payment success
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { paymentIntentId } = await req.json()

  // Verify with Stripe
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 })
  }

  const app = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = getVisaConfig(app.destinationIso2)

  const updated = await prisma.visaApplication.update({
    where: { id: app.id },
    data: {
      status: 'received',
      isDraft: false,
      serviceFeePaid: true,
      serviceFeeAmount: config?.serviceFeeUsd ?? 0,
      serviceFeeCurrency: 'USD',
      stripePaymentIntentId: paymentIntentId,
    },
  })

  // Send confirmation emails
  try {
    await Promise.all([
      sendVisaApplicationConfirmation(updated),
      sendVisaAdminNotification(updated),
    ])
  } catch (e) {
    console.error('Email send error:', e)
  }

  return NextResponse.json({ application: updated })
}
