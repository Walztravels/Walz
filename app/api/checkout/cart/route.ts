import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: NextRequest) {
  const { items, gateway } = await req.json()

  if (!items?.length) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  if (gateway === 'flutterwave') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = items.reduce((s: number, i: any) => s + i.price * i.quantity, 0)
    const txRef = `WALZ-${Date.now()}`

    const payload = {
      tx_ref:       txRef,
      amount:       total.toFixed(2),
      currency:     items[0]?.currency ?? 'USD',
      redirect_url: `${SITE}/booking/success?gateway=flutterwave&tx_ref=${txRef}`,
      meta: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: JSON.stringify(items.map((i: any) => ({ id: i.id, type: i.type, title: i.title }))),
      },
      customizations: {
        title:       'Walz Travels',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: items.map((i: any) => i.title).join(', '),
        logo:        `${SITE}/walz-logo.png`,
      },
    }

    const fw = await fetch('https://api.flutterwave.com/v3/payments', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const fwData = await fw.json()
    if (fwData.status === 'success') {
      return NextResponse.json({ url: fwData.data.link })
    }
    return NextResponse.json({ error: fwData.message ?? 'Flutterwave error' }, { status: 500 })
  }

  // Stripe checkout (default)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const line_items = items.map((item: any) => ({
    price_data: {
      currency:     (item.currency ?? 'usd').toLowerCase(),
      product_data: {
        name:     item.title,
        metadata: item.meta ?? {},
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity,
  }))

  const session = await stripe.checkout.sessions.create({
    mode:       'payment',
    line_items,
    success_url: `${SITE}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${SITE}/cart`,
    billing_address_collection: 'required',
    phone_number_collection:    { enabled: true },
    metadata: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items:   JSON.stringify(items.map((i: any) => ({ id: i.id, type: i.type, title: i.title }))),
      gateway: 'stripe',
    },
  })

  return NextResponse.json({ url: session.url })
}
