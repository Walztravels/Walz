import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

const schema = z.object({
  gateway:         z.enum(['stripe', 'flutterwave']).default('stripe'),
  packageCode:     z.string().min(1),
  packageName:     z.string().min(1),
  destination:     z.string().min(1),
  destinationIso2: z.string().min(2),
  durationDays:    z.number().int().min(1),
  dataAmount:      z.number().nullable().optional(),
  dataUnit:        z.string().optional().default('MB'),
  dataLabel:       z.string().optional().default(''),
  wholesaleUsd:    z.number().positive(),
  retailUsd:       z.number().positive(),
  speed:           z.string().optional().default('4G'),
  tripId:          z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body   = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  // Look up user phone for WhatsApp delivery
  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { phone: true },
  })
  const customerPhone = user?.phone ?? ''

  // ── Flutterwave ──────────────────────────────────────────────────────────────
  if (d.gateway === 'flutterwave') {
    const FLW_SECRET = process.env.FLW_SECRET_KEY
    if (!FLW_SECRET) {
      return NextResponse.json({ error: 'Flutterwave not configured' }, { status: 500 })
    }

    const txRef = `JADE-ESIM-${Date.now()}`
    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FLW_SECRET}` },
      body: JSON.stringify({
        tx_ref:       txRef,
        amount:       d.retailUsd,
        currency:     'USD',
        redirect_url: `${SITE}/esim?paid=1`,
        customer: {
          email: session.user.email,
          name:  session.user.name ?? 'Traveller',
        },
        customizations: {
          title:       'Jade Connect eSIM',
          description: `${d.destination} eSIM — ${d.packageName}`,
          logo:        `${SITE}/walz-logo.png`,
        },
        meta: {
          type:            'esim',
          packageCode:     d.packageCode,
          packageName:     d.packageName,
          destination:     d.destination,
          destinationIso2: d.destinationIso2,
          durationDays:    String(d.durationDays),
          dataAmount:      String(d.dataAmount ?? ''),
          dataUnit:        d.dataUnit,
          wholesaleUsd:    String(d.wholesaleUsd),
          retailUsd:       String(d.retailUsd),
          customerEmail:   session.user.email,
          customerPhone,
          tripId:          d.tripId ?? '',
        },
      }),
    })

    const flwData = await flwRes.json()
    if (flwData.status !== 'success') {
      console.error('[esim/checkout] Flutterwave error:', flwData)
      return NextResponse.json({ error: flwData.message ?? 'Flutterwave error' }, { status: 500 })
    }

    return NextResponse.json({ checkoutUrl: flwData.data?.link, gateway: 'flutterwave' })
  }

  // ── Stripe (default) ─────────────────────────────────────────────────────────
  const intent = await getStripe().paymentIntents.create({
    amount:        Math.round(d.retailUsd * 100),
    currency:      'usd',
    receipt_email: session.user.email,
    metadata: {
      type:            'esim',
      packageCode:     d.packageCode,
      packageName:     d.packageName,
      destination:     d.destination,
      destinationIso2: d.destinationIso2,
      durationDays:    String(d.durationDays),
      dataAmount:      String(d.dataAmount ?? ''),
      dataUnit:        d.dataUnit,
      dataLabel:       d.dataLabel,
      wholesaleUsd:    String(d.wholesaleUsd),
      retailUsd:       String(d.retailUsd),
      speed:           d.speed,
      tripId:          d.tripId ?? '',
      customerEmail:   session.user.email,
      customerPhone,
    },
  })

  return NextResponse.json({ clientSecret: intent.client_secret })
}
