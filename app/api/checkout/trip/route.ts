// POST /api/checkout/trip
// DB-authoritative checkout session creator for Jade Trip Checkout Handoff (Release 4D).
//
// Unlike /api/checkout/cart (which trusts item prices from the client payload),
// this route reads ALL prices from the database. The client provides only:
//   tripId, gateway, sessionId, checkoutToken
//
// SECURITY invariants:
//   - Checkout token verified (HMAC + expiry + owner-scope)
//   - Prices always from TripItem.cost in DB — never from client payload
//   - Stale items blocked server-side
//   - Purchased items excluded from new checkout
//   - Final revalidation runs before payment session creation
//   - jadeAssisted attribution embedded in payment metadata

import { NextRequest, NextResponse }  from 'next/server'
import { getServerSession }           from 'next-auth'
import { authOptions }                from '@/lib/auth'
import prisma                         from '@/lib/db'
import { stripe }                     from '@/lib/stripe'
import { trackDurableEvent }          from '@/lib/commercial/track'
import { setTripCheckoutStarted }     from '@/lib/trips/lifecycle'
import { verifyCheckoutToken }        from '@/lib/checkout/token'
import { revalidateAllTripItems }     from '@/lib/checkout/revalidate-trip'

export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// Types eligible for checkout — mirrors existing cart logic
const CART_ELIGIBLE_TYPES = new Set(['ACTIVITY', 'TRANSFER', 'TRANSPORT', 'HOTEL', 'FLIGHT'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { tripId, gateway, sessionId, checkoutToken } = body as {
    tripId?:       string
    gateway?:      string
    sessionId?:    string
    checkoutToken?: string
  }

  if (!tripId)        return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
  if (!gateway)       return NextResponse.json({ error: 'gateway is required' }, { status: 400 })
  if (!checkoutToken) return NextResponse.json({ error: 'checkoutToken is required' }, { status: 400 })

  // ── Resolve authenticated user ─────────────────────────────────────────────
  const authSession = await getServerSession(authOptions).catch(() => null)
  let userId: string | null = null
  if (authSession?.user?.email) {
    const user = await prisma.user.findUnique({
      where:  { email: authSession.user.email },
      select: { id: true },
    })
    userId = user?.id ?? null
  }
  const ownerId = userId ?? sessionId ?? null
  if (!ownerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  // ── Verify checkout token ──────────────────────────────────────────────────
  const tokenCheck = verifyCheckoutToken(checkoutToken, tripId, ownerId)
  if (!tokenCheck.valid) {
    return NextResponse.json({
      error:  'Your checkout session has expired or is invalid. Please return to your trip and try again.',
      reason: tokenCheck.reason,
    }, { status: 403 })
  }

  // ── Load trip + items from DB ──────────────────────────────────────────────
  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      userId:    true,
      sessionId: true,
      currency:  true,
      leadId:    true,
      status:    true,
      items: {
        select: {
          id:         true,
          type:       true,
          title:      true,
          description: true,
          cost:       true,
          currency:   true,
          confirmed:  true,
          bookingRef: true,
          sourceType: true,
          sourceId:   true,
          metadata:   true,
          location:   true,
          startTime:  true,
        },
      },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  // ── Ownership (belt-and-suspenders — token already scoped to owner) ────────
  const owns =
    (userId && trip.userId === userId) ||
    (!userId && sessionId && trip.sessionId === sessionId)
  if (!owns) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // ── Lifecycle guard ────────────────────────────────────────────────────────
  if (['PAID', 'CONFIRMING', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(trip.status)) {
    return NextResponse.json({
      error: `This trip is in ${trip.status} status and cannot enter a new checkout.`,
    }, { status: 409 })
  }

  // ── Filter eligible items (DB-authoritative) ───────────────────────────────
  // Prices come from TripItem.cost in DB — never from the client payload
  const eligible = trip.items.filter(i =>
    CART_ELIGIBLE_TYPES.has(i.type.toUpperCase()) &&
    !i.confirmed &&
    !i.bookingRef &&
    i.cost != null
  )
  if (eligible.length === 0) {
    return NextResponse.json({
      error: 'No checkout-eligible items found. Items may already be purchased.',
    }, { status: 422 })
  }

  // ── Multi-currency guard ───────────────────────────────────────────────────
  const currencies = [...new Set(eligible.map(i => (i.currency || trip.currency).toUpperCase()))]
  if (currencies.length > 1) {
    return NextResponse.json({
      error: 'MIXED_CURRENCY',
      message: 'Your cart contains items in multiple currencies. Please keep items in a single currency.',
      currencies,
    }, { status: 422 })
  }

  // ── Stale item gate (server-authoritative) ─────────────────────────────────
  const staleItems = eligible.filter(i => {
    const meta = (i.metadata ?? {}) as Record<string, unknown>
    return Boolean(meta.staleReason)
  })
  if (staleItems.length > 0) {
    return NextResponse.json({
      error:   'STALE_ITEMS',
      message: 'Some items in your trip are no longer valid. Please re-search before checking out.',
      items:   staleItems.map(i => ({ id: i.id, title: i.title })),
    }, { status: 422 })
  }

  // ── Final revalidation (authoritative prices from supplier APIs) ───────────
  const revalResult = await revalidateAllTripItems(eligible)

  if (revalResult.status === 'BLOCKED') {
    return NextResponse.json({
      error:    'CHECKOUT_BLOCKED',
      message:  'One or more items are no longer available or have expired. Please return to your trip.',
      issues:   revalResult.items
        .filter(i => ['SOLD_OUT', 'EXPIRED', 'STALE'].includes(i.status))
        .map(i => ({ title: i.title, status: i.status, reason: i.reason })),
    }, { status: 422 })
  }

  if (revalResult.status === 'ACTION_REQUIRED') {
    return NextResponse.json({
      error:        'PRICE_CHANGED',
      message:      'Prices have changed since your review. Please accept the updated prices before continuing.',
      priceChanges: revalResult.items
        .filter(i => i.status === 'PRICE_CHANGED')
        .map(i => ({ title: i.title, previousPrice: i.previousPrice, latestPrice: i.latestPrice, currency: i.currency })),
    }, { status: 422 })
  }

  // ── All clear — advance Trip lifecycle ─────────────────────────────────────
  void setTripCheckoutStarted({ tripId, sessionId: sessionId ?? null })

  // ── Upsert CartSession with leadId (recovery engine linkage) ──────────────
  if (sessionId) {
    const cartCurrency = currencies[0] ?? trip.currency
    const cartTotal    = eligible.reduce((s, i) => s + (i.cost ?? 0), 0)
    prisma.cartSession.upsert({
      where:  { sessionId },
      create: {
        sessionId,
        userId:      userId ?? undefined,
        leadId:      trip.leadId ?? undefined,
        currency:    cartCurrency,
        totalAmount: cartTotal,
        items:       eligible.map(i => ({ id: i.id, title: i.title, price: i.cost, currency: i.currency })),
      },
      update: {
        userId:      userId ?? undefined,
        leadId:      trip.leadId ?? undefined,
        currency:    cartCurrency,
        totalAmount: cartTotal,
        items:       eligible.map(i => ({ id: i.id, title: i.title, price: i.cost, currency: i.currency })),
      },
    }).catch(() => {})
  }

  const cartCurrency  = currencies[0]?.toLowerCase() ?? trip.currency.toLowerCase()
  const cartCurrencyU = cartCurrency.toUpperCase()

  // ── Commercial event ───────────────────────────────────────────────────────
  try {
    await trackDurableEvent('jade_checkout_started', {
      sessionId: sessionId ?? undefined,
      userId:    userId    ?? undefined,
      currency:  cartCurrencyU,
      amount:    eligible.reduce((s, i) => s + (i.cost ?? 0), 0),
      metadata:  { tripId, itemCount: eligible.length, gateway, jadeAssisted: true },
    })
  } catch { /* tracking must never block checkout */ }

  // ── Build payment session ──────────────────────────────────────────────────
  // Prices come from TripItem.cost (DB) — not from client payload

  // ── Paystack checkout ─────────────────────────────────────────────────────
  if (gateway === 'paystack') {
    // Paystack requires a customer email. Resolve from auth session or trip lead.
    let customerEmail = authSession?.user?.email ?? ''
    if (!customerEmail && trip.leadId) {
      const lead = await prisma.lead.findUnique({
        where:  { id: trip.leadId },
        select: { email: true },
      })
      customerEmail = lead?.email ?? ''
    }
    if (!customerEmail) {
      return NextResponse.json({
        error: 'An email address is required for Paystack checkout. Please sign in or contact support.',
      }, { status: 422 })
    }

    const total     = eligible.reduce((s, i) => s + (i.cost ?? 0), 0)
    const txRef     = `WALZ-JADE-PS-${Date.now()}`
    const amountKobo = Math.round(total * 100)

    const psResp = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email:        customerEmail,
        amount:       amountKobo,
        currency:     cartCurrencyU,
        reference:    txRef,
        callback_url: `${SITE}/booking/success?gateway=paystack&tx_ref=${txRef}&trip_id=${tripId}`,
        metadata: {
          walz_trip_id:    tripId,
          walz_session_id: sessionId ?? '',
          walz_lead_id:    trip.leadId ?? '',
          jade_assisted:   'true',
          custom_fields:   eligible.slice(0, 5).map(i => ({
            display_name:  i.title.slice(0, 40),
            variable_name: 'item',
            value:         `${i.currency} ${(i.cost ?? 0).toFixed(2)}`,
          })),
        },
      }),
    })
    const psData = await psResp.json()
    if (psData.status === true && psData.data?.authorization_url) {
      return NextResponse.json({ url: psData.data.authorization_url })
    }
    return NextResponse.json({ error: psData.message ?? 'Paystack initialization failed' }, { status: 500 })
  }

  if (gateway === 'flutterwave') {
    const total = eligible.reduce((s, i) => s + (i.cost ?? 0), 0)
    const txRef = `WALZ-JADE-${Date.now()}`

    const payload = {
      tx_ref:       txRef,
      amount:       total.toFixed(2),
      currency:     cartCurrencyU,
      redirect_url: `${SITE}/booking/success?gateway=flutterwave&tx_ref=${txRef}`,
      meta: {
        items: JSON.stringify(eligible.map(i => ({
          t: i.type, title: i.title, p: i.cost, cur: i.currency,
          loc: (i.location ?? '').slice(0, 30),
        }))),
        walz_trip_id:    tripId,
        walz_session_id: sessionId ?? '',
        walz_lead_id:    trip.leadId ?? '',
        jade_assisted:   'true',
        ...(sessionId ? { walz_session_id: sessionId } : {}),
      },
      customizations: {
        title:       'Walz Travels',
        description: eligible.map(i => i.title).join(', '),
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
    if (fwData.status === 'success') return NextResponse.json({ url: fwData.data.link })
    return NextResponse.json({ error: fwData.message ?? 'Flutterwave error' }, { status: 500 })
  }

  // ── Stripe checkout ────────────────────────────────────────────────────────
  const line_items = eligible.map(item => ({
    price_data: {
      currency:     cartCurrency,
      product_data: {
        name:        item.title,
        description: [item.location, item.startTime ? new Date(item.startTime).toLocaleDateString('en-GB') : null]
          .filter(Boolean).join(' · ') || undefined,
      },
      unit_amount: Math.round((item.cost ?? 0) * 100),  // DB price — never from client
    },
    quantity: 1,
  }))

  const itemMeta: Record<string, string> = {}
  eligible.forEach((item, idx) => {
    itemMeta[`item_${idx}`] = JSON.stringify({
      tid:   item.id,
      t:     item.type,
      title: item.title.slice(0, 60),
      p:     item.cost,
      cur:   item.currency,
      loc:   (item.location ?? '').slice(0, 30),
    }).slice(0, 500)
  })
  itemMeta.item_count      = String(eligible.length)
  itemMeta.gateway         = 'stripe'
  itemMeta.walz_trip_id    = tripId.slice(0, 64)
  itemMeta.jade_assisted   = 'true'
  if (sessionId)        itemMeta.walz_session_id = sessionId.slice(0, 64)
  if (trip.leadId)      itemMeta.walz_lead_id    = trip.leadId.slice(0, 64)

  const stripeSession = await stripe.checkout.sessions.create({
    mode:       'payment',
    line_items,
    success_url:  `${SITE}/booking/success?session_id={CHECKOUT_SESSION_ID}&trip_id=${tripId}`,
    cancel_url:   `${SITE}/checkout/trip/${tripId}?ct=${encodeURIComponent(checkoutToken)}&cancelled=1`,
    billing_address_collection: 'required',
    phone_number_collection:    { enabled: true },
    payment_method_options: {
      card: { request_three_d_secure: 'automatic' },
    },
    metadata: itemMeta,
  })

  return NextResponse.json({ url: stripeSession.url })
}
