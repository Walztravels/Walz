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

  // ── Authoritative pricing: revalidate against the supplier catalogue ──────
  // Browser retailUsd/wholesaleUsd are display echoes only.
  const { fetchCountryPackages } = await import('@/lib/esim/api')
  let authoritative
  try {
    const packages = await fetchCountryPackages(d.destinationIso2.toUpperCase())
    authoritative  = packages.find(p => p.packageCode === d.packageCode)
  } catch (err) {
    console.error('[esim/stripe-session] package revalidation failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'eSIM pricing is temporarily unavailable. Please try again shortly.' }, { status: 503 })
  }
  if (!authoritative || !Number.isFinite(authoritative.retailUsd) || authoritative.retailUsd <= 0) {
    return NextResponse.json({ error: 'This eSIM package is no longer available. Please pick another.' }, { status: 409 })
  }
  if (Math.abs(authoritative.retailUsd - d.retailUsd) > 0.01) {
    return NextResponse.json(
      { error: 'PRICE_CHANGED', message: `The price of this package is now $${authoritative.retailUsd.toFixed(2)}. Please review and try again.`, retailUsd: authoritative.retailUsd },
      { status: 409 },
    )
  }
  d.retailUsd    = authoritative.retailUsd
  d.wholesaleUsd = authoritative.wholesaleUsd

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
