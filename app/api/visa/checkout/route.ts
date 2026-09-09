import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/db'
import { getVisaConfig } from '@/lib/visa-config'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

export async function POST(req: NextRequest) {
  const { applicationId, gateway } = await req.json()

  if (!applicationId || !gateway) {
    return NextResponse.json({ error: 'applicationId and gateway required' }, { status: 400 })
  }

  const app = await prisma.visaApplication.findUnique({
    where:  { id: applicationId },
    select: {
      id: true, referenceNumber: true,
      destinationIso2: true,
      email: true, firstName: true, lastName: true,
      serviceFeePaid: true,
    },
  })

  if (!app)               return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.serviceFeePaid) return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  // ── Canonical price: exactly ONE amount + currency, fixed BEFORE gateway
  // selection. The config field is serviceFeeUsd and the public visa pages
  // advertise it as USD (<Price from="USD">), so USD is the economic price —
  // every provider charges the same USD amount. Gateway choice must never
  // change what the customer pays.
  const config      = getVisaConfig(app.destinationIso2)
  const feeAmount   = config?.serviceFeeUsd ?? 150
  const FEE_CURRENCY = 'USD' as const
  const clientName  = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'
  const ref         = app.referenceNumber ?? app.id

  // ── STRIPE ────────────────────────────────────────────────────────────────
  if (gateway === 'stripe') {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'payment',
      customer_email:       app.email ?? undefined,
      line_items: [{
        price_data: {
          currency:    FEE_CURRENCY.toLowerCase(),
          unit_amount: Math.round(feeAmount * 100),
          product_data: {
            name:        `Visa Service — ${config?.name ?? app.destinationIso2}`,
            description: `Application Ref: ${ref}`,
          },
        },
        quantity: 1,
      }],
      metadata:    { applicationId: app.id, gateway: 'stripe' },
      success_url: `${SITE}/visa/payment/success?ref=${ref}&gateway=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${SITE}/visa/payment/cancelled?ref=${ref}`,
    })

    await prisma.visaApplication.update({
      where: { id: app.id },
      data:  {
        stripePaymentIntentId: session.id,
        serviceFeeAmount:      feeAmount,
        serviceFeeCurrency:    FEE_CURRENCY,
      },
    })

    return NextResponse.json({ checkoutUrl: session.url, gateway: 'stripe' })
  }

  // ── FLUTTERWAVE ───────────────────────────────────────────────────────────
  if (gateway === 'flutterwave') {
    const FLW_SECRET = process.env.FLW_SECRET_KEY
    if (!FLW_SECRET) {
      return NextResponse.json({ error: 'Flutterwave not configured' }, { status: 500 })
    }

    const txRef = `WALZ-${ref}-${Date.now()}`

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${FLW_SECRET}`,
      },
      body: JSON.stringify({
        tx_ref:       txRef,
        amount:       feeAmount,
        currency:     FEE_CURRENCY,
        redirect_url: `${SITE}/visa/payment/success?ref=${ref}&gateway=flutterwave`,
        customer: {
          email: app.email ?? 'client@walztravels.com',
          name:  clientName,
        },
        customizations: {
          title:       'Walz Travels Visa Service',
          description: `${config?.name ?? app.destinationIso2} Visa Application — Ref: ${ref}`,
          logo:        `${SITE}/walz-logo.png`,
        },
        meta: {
          applicationId: app.id,
          reference:     ref,
          gateway:       'flutterwave',
        },
      }),
    })

    const flwData = await flwRes.json()

    if (flwData.status !== 'success') {
      console.error('[FLW] Error:', flwData)
      return NextResponse.json({ error: flwData.message ?? 'Flutterwave error' }, { status: 500 })
    }

    await prisma.visaApplication.update({
      where: { id: app.id },
      data:  {
        serviceFeeAmount:   feeAmount,
        serviceFeeCurrency: FEE_CURRENCY,
      },
    })

    return NextResponse.json({ checkoutUrl: flwData.data?.link, gateway: 'flutterwave' })
  }

  return NextResponse.json({ error: 'Invalid gateway' }, { status: 400 })
}
