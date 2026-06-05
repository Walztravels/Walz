import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/flights/pay
 *
 * Supports three Duffel payment methods for held orders:
 *
 * 1. "balance" — Pay using Duffel account balance.
 *    Body: { order_id, amount, currency, payment_type: "balance" }
 *    Duffel: POST /air/payments
 *
 * 2. "card" + card_id — Pay with tokenised card (tcd_...) without 3DS.
 *    Body: { order_id, amount, currency, payment_type: "card", card_id: "tcd_..." }
 *    Duffel: POST /air/payments
 *
 * 3. "card" + three_d_secure_session_id — Pay with 3DS-authenticated card.
 *    Body: { order_id, amount, currency, payment_type: "card", three_d_secure_session_id: "3ds_..." }
 *    Duffel: POST /air/orders/{order_id}/payment
 */

const balancePaySchema = z.object({
  order_id: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3),
  payment_type: z.literal('balance'),
})

const cardPaySchema = z.object({
  order_id: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3),
  payment_type: z.literal('card'),
  /** Tokenised card ID from DuffelCardForm (tcd_...) — uses POST /air/payments */
  card_id: z.string().optional(),
  /** 3DS session ID from createThreeDSecureSession (3ds_...) — uses POST /air/orders/{id}/payment */
  three_d_secure_session_id: z.string().optional(),
})

const paySchema = z.discriminatedUnion('payment_type', [balancePaySchema, cardPaySchema])

interface DuffelPaymentResponse {
  data: {
    id?: string
    order_id?: string
    amount?: string
    currency?: string
    type?: string
    documents?: { unique_identifier: string; type: string }[]
    payment_status?: {
      awaiting_payment: boolean
      price_guarantee_expires_at?: string | null
      payment_required_by?: string | null
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = paySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const data = parsed.data

  try {
    if (data.payment_type === 'balance') {
      // POST /air/payments — pay from Duffel account balance
      const result = await duffelPost<DuffelPaymentResponse>('/air/payments', {
        data: {
          order_id: data.order_id,
          payment: {
            type: 'balance',
            amount: data.amount,
            currency: data.currency,
          },
        },
      })

      return NextResponse.json({
        success: true,
        payment_id: result.data.id,
        order_id: data.order_id,
        documents: result.data.documents ?? [],
      })
    } else if (data.payment_type === 'card' && !data.card_id && !data.three_d_secure_session_id) {
      return NextResponse.json(
        { error: 'Either card_id or three_d_secure_session_id is required for card payment' },
        { status: 400 }
      )
    } else if (data.payment_type === 'card' && data.card_id) {
      // POST /air/payments — pay with tokenised card (no 3DS)
      const result = await duffelPost<DuffelPaymentResponse>('/air/payments', {
        data: {
          order_id: data.order_id,
          payment: {
            type: 'card',
            card_id: data.card_id,
            amount: data.amount,
            currency: data.currency,
          },
        },
      })

      const awaiting = result.data.payment_status?.awaiting_payment ?? false
      return NextResponse.json({
        success: !awaiting,
        awaiting_payment: awaiting,
        payment_id: result.data.id,
        order_id: data.order_id,
        documents: result.data.documents ?? [],
      })
    } else {
      // POST /air/orders/{id}/payment — pay held order with 3DS-authenticated card
      const result = await duffelPost<DuffelPaymentResponse>(
        `/air/orders/${data.order_id}/payment`,
        {
          data: {
            payments: [
              {
                three_d_secure_session_id: data.three_d_secure_session_id,
                currency: data.currency,
                amount: data.amount,
              },
            ],
          },
        }
      )

      const awaiting = result.data.payment_status?.awaiting_payment ?? false
      return NextResponse.json({
        success: !awaiting,
        awaiting_payment: awaiting,
        order_id: data.order_id,
        documents: result.data.documents ?? [],
      })
    }
  } catch (err) {
    console.error('[Pay] Duffel payment error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payment failed' },
      { status: 502 }
    )
  }
}
