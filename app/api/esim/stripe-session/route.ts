import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'


const schema = z.object({
  packageCode:     z.string().min(1),
  packageName:     z.string().min(1),
  destination:     z.string().min(1),
  destinationIso2: z.string().min(2),
  durationDays:    z.number().int().min(1),
  dataGb:          z.number().nullable().optional(),
  dataLabelStr:    z.string().optional().default(''),
  wholesaleUsd:    z.number().min(0),
  retailUsd:       z.number().min(0.01),
  tripId:          z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const origin = req.headers.get('origin') ?? 'https://walztravels.com'

  // Encode eSIM details in metadata for webhook
  const stripeSession = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode:                 'payment',
    customer_email:       session.user.email,
    line_items: [{
      price_data: {
        currency:     'usd',
        unit_amount:  Math.round(d.retailUsd * 100),
        product_data: {
          name:        `Jade Connect eSIM — ${d.destination}`,
          description: `${d.packageName} · ${d.durationDays} days · ${d.dataLabelStr || (d.dataGb ? `${d.dataGb} GB` : 'Unlimited')}`,
          images:      ['https://walztravels.com/walz-logo.png'],
        },
      },
      quantity: 1,
    }],
    metadata: {
      type:            'esim',
      packageCode:     d.packageCode,
      packageName:     d.packageName,
      destination:     d.destination,
      destinationIso2: d.destinationIso2,
      durationDays:    String(d.durationDays),
      dataGb:          String(d.dataGb ?? ''),
      dataLabelStr:    d.dataLabelStr,
      wholesaleUsd:    String(d.wholesaleUsd),
      retailUsd:       String(d.retailUsd),
      tripId:          d.tripId ?? '',
      customerEmail:   session.user.email,
    },
    success_url: `${origin}/esim/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/esim?cancelled=1`,
  })

  return NextResponse.json({ url: stripeSession.url, sessionId: stripeSession.id })
}
