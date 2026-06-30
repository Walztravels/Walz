import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { z } from 'zod'

export const dynamic = 'force-dynamic'


// ── Validation ────────────────────────────────────────────────────────────────

const primarySchema = z.object({
  first_name:    z.string().min(1),
  last_name:     z.string().min(1),
  email:         z.string().email(),
  phone:         z.string().min(5),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address:       z.string().min(3),
  city:          z.string().min(1),
  country:       z.string().min(2),
  postal_code:   z.string().min(1),
})

const bodySchema = z.object({
  quote_id:             z.string().min(1),
  battleface_quote_id:  z.string().min(1),
  product_id:           z.string().min(1),
  plan_name:            z.string().default('Walz Travel Shield'),
  premium:              z.number().positive(),
  currency:             z.string().length(3).default('USD'),
  primary_traveller:    primarySchema,
  additional_travellers: z.array(z.object({
    first_name:    z.string().min(1),
    last_name:     z.string().min(1),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).optional().default([]),
  trip_start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trip_end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  destination_country: z.string().length(2),
})

function bfHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.BATTLEFACE_BEARER_TOKEN}`,
  }
}

/**
 * POST /api/insurance/order
 * Requires auth session.
 * 1. Creates order with Battleface
 * 2. Creates Stripe PaymentIntent
 * 3. Saves pending order to insurance_orders
 * Returns: client_secret, payment_intent_id, battleface_order_id
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in to purchase insurance' }, { status: 401 })
  }

  const body   = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d       = parsed.data
  const baseUrl = process.env.BATTLEFACE_API_URL
  if (!baseUrl || !process.env.BATTLEFACE_BEARER_TOKEN) {
    return NextResponse.json({ error: 'Insurance API not configured' }, { status: 503 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true },
  })

  // ── Create order with Battleface ──────────────────────────────────────────
  let bfOrder: Record<string, unknown> = {}
  try {
    const bfRes = await fetch(`${baseUrl}/orders`, {
      method:  'POST',
      headers: bfHeaders(),
      body: JSON.stringify({
        quote_id:             d.battleface_quote_id,
        product_id:           d.product_id,
        primary_traveller:    d.primary_traveller,
        additional_travellers: d.additional_travellers,
        trip_start_date:     d.trip_start_date,
        trip_end_date:       d.trip_end_date,
        destination_country: d.destination_country,
      }),
    })

    if (!bfRes.ok) {
      const txt = await bfRes.text()
      console.error('[POST /api/insurance/order] bf error:', bfRes.status, txt)
      return NextResponse.json(
        { error: 'Could not create insurance order. Please try again.' },
        { status: 502 },
      )
    }
    bfOrder = await bfRes.json()
  } catch (err) {
    console.error('[POST /api/insurance/order] fetch error:', err)
    return NextResponse.json(
      { error: 'Could not reach insurance provider. Please try again.' },
      { status: 502 },
    )
  }

  const bfOrderId   = String(bfOrder.order_id ?? bfOrder.id ?? crypto.randomUUID())
  const orderRef    = String(bfOrder.order_reference ?? bfOrder.reference ?? bfOrderId)

  // ── Create Stripe PaymentIntent ────────────────────────────────────────────
  const intent = await getStripe().paymentIntents.create({
    amount:        Math.round(d.premium * 100),
    currency:      d.currency.toLowerCase(),
    receipt_email: d.primary_traveller.email,
    metadata: {
      type:               'insurance',
      battleface_order_id: bfOrderId,
      order_reference:    orderRef,
      quote_id:           d.quote_id,
      plan_name:          d.plan_name,
      destination_country: d.destination_country,
      trip_start_date:    d.trip_start_date,
      trip_end_date:      d.trip_end_date,
      customer_email:     session.user.email,
      premium:            String(d.premium),
      currency:           d.currency,
    },
  })

  // ── Persist pending order ──────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO insurance_orders (
        client_id, battleface_order_id, order_reference, quote_id,
        plan_name, status, premium, currency,
        destination_country, trip_start_date, trip_end_date,
        primary_traveller, additional_travellers,
        stripe_payment_id, raw_response
      ) VALUES (
        $1, $2, $3, $4,
        $5, 'pending', $6, $7,
        $8, $9::date, $10::date,
        $11::jsonb, $12::jsonb,
        $13, $14::jsonb
      )
    `,
      user?.id ?? null,
      bfOrderId,
      orderRef,
      d.quote_id,
      d.plan_name,
      d.premium,
      d.currency,
      d.destination_country,
      d.trip_start_date,
      d.trip_end_date,
      JSON.stringify(d.primary_traveller),
      JSON.stringify(d.additional_travellers),
      intent.id,
      JSON.stringify(bfOrder),
    )
  } catch (err) {
    console.error('[POST /api/insurance/order] DB write error:', err)
    // Stripe intent created — don't block the user but log for manual reconciliation
  }

  return NextResponse.json({
    client_secret:       intent.client_secret,
    payment_intent_id:   intent.id,
    battleface_order_id: bfOrderId,
    order_reference:     orderRef,
    payment_amount:      d.premium,
    currency:            d.currency,
  })
}
