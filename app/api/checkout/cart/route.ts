import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// Compact representation stored per-item in Stripe metadata.
// Stripe allows 50 keys × 500 chars; each compact item JSON is ~180 chars.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactItem(item: any, idx: number) {
  return JSON.stringify({
    cid:   String(idx),                             // stable cart-line ID (position within this session)
    t:     item.type,
    title: (item.title ?? '').slice(0, 60),
    s:     item.meta?.supplier   ?? '',
    pc:    item.meta?.productCode         ?? '',
    poc:   item.meta?.productOptionCode   ?? '',
    d:     item.meta?.date       ?? '',
    a:     Number(item.meta?.adults   ?? item.quantity ?? 1),
    c:     Number(item.meta?.children ?? 0),
    i:     Number(item.meta?.infants  ?? 0),
    st:    item.meta?.startTime  ?? '',
    p:     item.price,
    cur:   item.currency ?? 'GBP',
    loc:   (item.meta?.location ?? '').slice(0, 30),
    dur:   (item.meta?.duration ?? '').slice(0, 20),
  })
}

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
        // Full item data for post-payment booking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: JSON.stringify(items.map((i: any) => ({
          t: i.type, title: i.title, s: i.meta?.supplier ?? '',
          pc: i.meta?.productCode ?? '', poc: i.meta?.productOptionCode ?? '',
          d: i.meta?.date ?? '', a: Number(i.meta?.adults ?? 1),
          c: Number(i.meta?.children ?? 0), i: Number(i.meta?.infants ?? 0),
          st: i.meta?.startTime ?? '', p: i.price, cur: i.currency ?? 'GBP',
          loc: i.meta?.location ?? '', dur: i.meta?.duration ?? '',
        }))),
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
        Authorization:  `Bearer ${process.env.FLW_SECRET_KEY}`,
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

  // ── Stripe checkout ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const line_items = items.map((item: any) => ({
    price_data: {
      currency:     (item.currency ?? 'usd').toLowerCase(),
      product_data: {
        name:        item.title,
        description: [item.meta?.location, item.meta?.date, item.meta?.duration]
          .filter(Boolean).join(' · ') || undefined,
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity ?? 1,
  }))

  // Store compact item data per-key so confirm can call supplier APIs.
  // Stripe metadata: 50 keys max, 500 chars per value, 8000 chars total.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemMeta: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items.forEach((item: any, idx: number) => {
    itemMeta[`item_${idx}`] = compactItem(item, idx).slice(0, 500)
  })
  itemMeta.item_count = String(items.length)
  itemMeta.gateway    = 'stripe'

  const session = await stripe.checkout.sessions.create({
    mode:       'payment',
    line_items,
    success_url: `${SITE}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${SITE}/cart`,
    billing_address_collection: 'required',
    phone_number_collection:    { enabled: true },
    payment_method_options: {
      card: { request_three_d_secure: 'automatic' },
    },
    metadata: itemMeta,
  })

  return NextResponse.json({ url: session.url })
}
