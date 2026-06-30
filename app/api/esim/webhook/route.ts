import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { esimHeaders, ESIM_BASE, calcMargin, generateOrderRef, formatData } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'


async function fulfillEsim(intent: Stripe.PaymentIntent) {
  const meta = intent.metadata ?? {}
  if (meta.type !== 'esim') return

  // Idempotency — check if already fulfilled
  const existing = await prisma.esimOrder.findFirst({
    where: { stripePaymentId: intent.id },
  })
  if (existing) {
    console.log('[esim/webhook] already fulfilled:', intent.id)
    return
  }

  const wholesale  = Number(meta.wholesaleUsd)
  const retail     = Number(meta.retailUsd)
  const orderRef   = generateOrderRef()
  const { label: dataLabel } = formatData(Number(meta.dataAmount) || 0)

  // Place eSIM order with eSIM Access
  let esimData: Record<string, unknown> = {}
  try {
    const res  = await fetch(`${ESIM_BASE}/open/esim/order`, {
      method:  'POST',
      headers: esimHeaders(),
      body: JSON.stringify({
        transactionId:   orderRef,
        packageInfoList: [{ packageCode: meta.packageCode, count: 1, price: wholesale }],
        orderNo:         orderRef,
        amount:          wholesale,
        paymentMethod:   3,
      }),
    })
    const json = await res.json()
    if (json?.success || json?.errorCode === '0') {
      esimData = json?.obj ?? {}
    } else {
      console.error('[esim/webhook] eSIM order failed:', json)
    }
  } catch (err) {
    console.error('[esim/webhook] eSIM order error:', err)
  }

  const esimList = Array.isArray(esimData?.esimList) ? esimData.esimList as Record<string, unknown>[] : []
  const esim     = esimList[0] ?? {}
  const iccid    = String(esim.iccid       ?? '')
  const qrCodeUrl      = String(esim.qrCodeUrl ?? esim.shortUrl ?? '')
  const activationCode = String(esim.ac        ?? '')
  const smdpAddress    = String(esim.smdpAddress ?? '')
  const lpaString      = smdpAddress && activationCode ? `LPA:1:${smdpAddress}:${activationCode}` : ''

  // Save order
  const user = await prisma.user.findUnique({
    where: { email: meta.customerEmail ?? '' },
    select: { id: true, name: true, email: true },
  })

  await prisma.esimOrder.create({
    data: {
      userId:           user?.id ?? null,
      tripId:           meta.tripId || null,
      orderRef,
      transactionId:    orderRef,
      esimAccessOrderNo: String(esimData.orderNo ?? ''),
      destination:      meta.destination,
      destinationIso2:  meta.destinationIso2,
      packageCode:      meta.packageCode,
      packageName:      meta.packageName,
      durationDays:     Number(meta.durationDays),
      dataAmount:       Number(meta.dataAmount) || null,
      dataUnit:         meta.dataUnit || null,
      wholesaleCostUsd: wholesale,
      retailPriceUsd:   retail,
      marginUsd:        calcMargin(wholesale, retail),
      iccid:            iccid || null,
      qrCodeUrl:        qrCodeUrl || null,
      activationCode:   activationCode || null,
      smdpAddress:      smdpAddress || null,
      lpaString:        lpaString || null,
      status:           iccid ? 'active' : 'pending',
      stripePaymentId:  intent.id,
      emailSent:        false,
    },
  })

  // Send QR email
  if (user?.email && qrCodeUrl) {
    try {
      await getResend().emails.send({
        from:    'Jade Connect <noreply@walztravels.com>',
        to:      user.email,
        subject: `📶 Your Jade Connect eSIM — ${meta.destination}`,
        html:    `<p>Your eSIM QR code is ready. Order ref: ${orderRef}</p>
                  ${qrCodeUrl ? `<img src="${qrCodeUrl}" width="200" alt="QR Code"/>` : ''}
                  <p>LPA: <code>${lpaString}</code></p>
                  <p>iPhone: Settings → Mobile Data → Add eSIM → Use QR Code<br>
                  Android: Settings → Network → SIM → Add eSIM → Scan QR</p>`,
      })
    } catch (e) {
      console.error('[esim/webhook] email failed:', e)
    }
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''
  const secret  = process.env.STRIPE_ESIM_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event
  try {
    if (secret) {
      event = getStripe().webhooks.constructEvent(payload, sig, secret)
    } else {
      // No webhook secret configured — parse directly (development only)
      event = JSON.parse(payload) as Stripe.Event
    }
  } catch (err) {
    console.error('[esim/webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    await fulfillEsim(event.data.object as Stripe.PaymentIntent)
  }

  return NextResponse.json({ received: true })
}
