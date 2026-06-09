import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const schema = z.object({
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

  // Create a PaymentIntent so we can use Stripe Elements (embedded, no redirect)
  const intent = await stripe.paymentIntents.create({
    amount:   Math.round(d.retailUsd * 100),
    currency: 'usd',
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
    },
  })

  return NextResponse.json({ clientSecret: intent.client_secret })
}
