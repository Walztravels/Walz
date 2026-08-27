import { NextRequest, NextResponse } from 'next/server'
import { stripe }                    from '@/lib/stripe'
import { trackDurableEvent }         from '@/lib/commercial/track'
import { revalidateTripActivityItem } from '@/lib/trips/revalidate'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// Compact representation stored per-item in Stripe metadata.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactItem(item: any, idx: number) {
  return JSON.stringify({
    cid:   String(idx),
    t:     item.type,
    title: (item.title ?? '').slice(0, 60),
    s:     item.meta?.supplier           ?? '',
    pc:    item.meta?.productCode        ?? '',
    poc:   item.meta?.productOptionCode  ?? '',
    d:     item.meta?.date               ?? '',
    a:     Number(item.meta?.adults  ?? item.quantity ?? 1),
    c:     Number(item.meta?.children ?? 0),
    i:     Number(item.meta?.infants  ?? 0),
    st:    item.meta?.startTime          ?? '',
    p:     item.price,
    cur:   item.currency ?? 'GBP',
    loc:   (item.meta?.location ?? '').slice(0, 30),
    dur:   (item.meta?.duration  ?? '').slice(0, 20),
  })
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { items, gateway, sessionId } = await req.json() as { items: any[]; gateway: string; sessionId?: string }

  if (!items?.length) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // ── Mixed-currency guard ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currencies = [...new Set<string>(items.map((i: any) => (i.currency || 'GBP').toUpperCase()))]
  if (currencies.length > 1) {
    return NextResponse.json({
      error:      'MIXED_CURRENCY',
      message:    'Your cart contains items in multiple currencies. Please keep items in a single currency before continuing to checkout.',
      currencies,
    }, { status: 422 })
  }

  // ── Viator activity revalidation at checkout ───────────────────────────────
  // Revalidate all Viator activity items before creating a payment session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viatorItems = items.filter((i: any) =>
    (i.type === 'activity' || i.type === 'ACTIVITY') &&
    (i.meta?.supplier ?? '').toLowerCase() === 'viator' &&
    i.meta?.productCode
  )

  if (viatorItems.length > 0) {
    const revalResults = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      viatorItems.map(async (i: any) => {
        const result = await revalidateTripActivityItem({
          cost:       i.price,
          currency:   i.currency ?? 'GBP',
          sourceType: 'viator',
          sourceId:   i.meta?.productCode ?? null,
          metadata:   {
            travelDate: i.meta?.date      ?? null,
            adults:     i.meta?.adults    ?? 1,
            children:   i.meta?.children  ?? 0,
            infants:    i.meta?.infants   ?? 0,
          },
        })
        return { item: i, result }
      })
    )

    const soldOut     = revalResults.filter(r => r.result.status === 'SOLD_OUT')
    const changed     = revalResults.filter(r => r.result.status === 'PRICE_CHANGED')
    const failed      = revalResults.filter(r => r.result.status === 'REVALIDATION_FAILED')

    if (soldOut.length > 0) {
      return NextResponse.json({
        error: 'ITEMS_SOLD_OUT',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: soldOut.map(r => ({ title: (r.item as any).title })),
      }, { status: 422 })
    }

    if (changed.length > 0) {
      return NextResponse.json({
        error:   'PRICE_CHANGED',
        message: 'One or more activity prices have changed since you added them. Please review your cart.',
        changes: changed.map(r => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title:         (r.item as any).title,
          previousPrice: r.result.previousPrice,
          latestPrice:   r.result.latestPrice,
          currency:      r.result.currency,
        })),
      }, { status: 422 })
    }

    if (failed.length > 0) {
      return NextResponse.json({
        error:   'REVALIDATION_FAILED',
        message: 'We could not confirm the latest price for one or more activities. Please try again.',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items:   failed.map(r => ({ title: (r.item as any).title })),
      }, { status: 422 })
    }
  }

  if (gateway === 'flutterwave') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total  = items.reduce((s: number, i: any) => s + i.price * i.quantity, 0)
    const txRef  = `WALZ-${Date.now()}`
    const fwCurrency = items[0]?.currency ?? 'USD'

    const payload = {
      tx_ref:       txRef,
      amount:       total.toFixed(2),
      currency:     fwCurrency,
      redirect_url: `${SITE}/booking/success?gateway=flutterwave&tx_ref=${txRef}`,
      meta: {
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

    // Track checkout_started for Flutterwave (was missing before)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fwTotal = items.reduce((s: number, i: any) => s + i.price * (i.quantity ?? 1), 0)
      await trackDurableEvent('checkout_started', {
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        currency:  fwCurrency,
        amount:    fwTotal,
        metadata:  { itemCount: items.length, gateway: 'flutterwave' },
      })
    } catch { /* tracking must never fail checkout */ }

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
  // All items share the same currency (mixed-currency guard above).
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

  const cartCurrency = items[0]?.currency ?? 'GBP'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cartTotal    = items.reduce((s: number, i: any) => s + i.price * (i.quantity ?? 1), 0)
  try {
    await trackDurableEvent('checkout_started', {
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      currency:  cartCurrency,
      amount:    cartTotal,
      metadata:  { itemCount: items.length, gateway: 'stripe' },
    })
  } catch { /* tracking must never fail checkout */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemMeta: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items.forEach((item: any, idx: number) => {
    itemMeta[`item_${idx}`] = compactItem(item, idx).slice(0, 500)
  })
  itemMeta.item_count = String(items.length)
  itemMeta.gateway    = 'stripe'
  if (typeof sessionId === 'string') itemMeta.walz_session_id = sessionId.slice(0, 64)

  const stripeSession = await stripe.checkout.sessions.create({
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

  return NextResponse.json({ url: stripeSession.url })
}
