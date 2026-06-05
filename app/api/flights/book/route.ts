import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

// ─── Passenger schema ─────────────────────────────────────────────────────────

const passengerSchema = z.object({
  id: z.string(),
  given_name: z.string().min(1),
  family_name: z.string().min(1),
  born_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  gender: z.enum(['m', 'f']),
  title: z.enum(['mr', 'ms', 'mrs', 'miss', 'dr']),
  email: z.string().email(),
  phone_number: z.string().min(5),
  /** Links an adult passenger to their lap infant */
  infant_passenger_id: z.string().optional(),
  loyalty_programme_accounts: z
    .array(z.object({ airline_iata_code: z.string(), account_number: z.string() }))
    .optional(),
})

const serviceSchema = z.object({ id: z.string(), quantity: z.number().int().min(1) })

// ─── Request schemas — discriminated by order type ────────────────────────────

const holdSchema = z.object({
  type: z.literal('hold'),
  offer_id: z.string().min(1),
  passengers: z.array(passengerSchema).min(1),
  services: z.array(serviceSchema).optional(),
})

const instantSchema = z.object({
  type: z.literal('instant'),
  offer_id: z.string().min(1),
  passengers: z.array(passengerSchema).min(1),
  services: z.array(serviceSchema).optional(),
  payment: z.object({
    type: z.enum(['card', 'balance', 'arc_bsp_cash']),
    currency: z.string().length(3),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    /** 3DS session ID from createThreeDSecureSession() (3ds_...) */
    three_d_secure_session_id: z.string().optional(),
    /** Tokenised card ID from DuffelCardForm (tcd_...) — alternative to 3DS */
    card_id: z.string().optional(),
  }),
})

const bookSchema = z.discriminatedUnion('type', [holdSchema, instantSchema])

// ─── Duffel response type ─────────────────────────────────────────────────────

interface DuffelOrderResponse {
  data: {
    id: string
    booking_reference: string
    total_amount: string
    total_currency: string
    payment_status: {
      awaiting_payment: boolean
      price_guarantee_expires_at?: string | null
      payment_required_by?: string | null
    }
    payment_requirements?: {
      requires_instant_payment: boolean
      price_guarantee_expires_at?: string | null
      payment_required_by?: string | null
    }
    documents?: { unique_identifier: string; type: string }[]
    slices: unknown[]
    passengers: unknown[]
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = bookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const d = parsed.data

  try {
    const orderData: Record<string, unknown> = {
      type: d.type,
      selected_offers: [d.offer_id],
      passengers: d.passengers,
      ...(d.services?.length ? { services: d.services } : {}),
    }

    if (d.type === 'instant') {
      orderData.payments = [d.payment]
    }

    const result = await duffelPost<DuffelOrderResponse>('/air/orders', { data: orderData })
    const order = result.data

    return NextResponse.json({
      order_id: order.id,
      booking_reference: order.booking_reference,
      total_amount: order.total_amount,
      total_currency: order.total_currency,
      awaiting_payment: order.payment_status.awaiting_payment,
      documents: order.documents ?? [],
      payment_required_by:
        order.payment_status.payment_required_by ??
        order.payment_requirements?.payment_required_by ??
        null,
      price_guarantee_expires_at:
        order.payment_status.price_guarantee_expires_at ??
        order.payment_requirements?.price_guarantee_expires_at ??
        null,
    })
  } catch (err) {
    console.error('[Book] Duffel order error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create booking' },
      { status: 502 }
    )
  }
}
