import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import prisma from '@/lib/db'
import { getVisaConfig } from '@/lib/visa-config'


const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

export async function POST(req: NextRequest) {
  const { applicationId } = await req.json()

  const app = await prisma.visaApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, referenceNumber: true,
      destinationIso2: true, email: true,
      firstName: true, lastName: true,
      stripePaymentIntentId: true, serviceFeePaid: true,
    },
  })

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.serviceFeePaid) return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  const config   = getVisaConfig(app.destinationIso2)
  const feeGbp   = config?.serviceFeeUsd ?? 150
  const amountPence = Math.round(feeGbp * 100)

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode:                 'payment',
    customer_email:       app.email ?? undefined,
    line_items: [{
      price_data: {
        currency:     'gbp',
        unit_amount:  amountPence,
        product_data: {
          name:        `Walz Travels Visa Service — ${config?.name ?? app.destinationIso2}`,
          description: `Application reference: ${app.referenceNumber}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      applicationId:   app.id,
      referenceNumber: app.referenceNumber ?? '',
    },
    success_url: `${SITE}/visa/apply/success?ref=${app.referenceNumber}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${SITE}/visa/apply/cancelled?ref=${app.referenceNumber}`,
  })

  await prisma.visaApplication.update({
    where: { id: app.id },
    data:  { stripePaymentIntentId: session.id },
  })

  return NextResponse.json({ checkoutUrl: session.url })
}
