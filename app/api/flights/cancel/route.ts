import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * Duffel order cancellation — two-step flow:
 *
 * Step 1 — Create cancellation (this route, action: "create"):
 *   POST /air/order_cancellations { order_id }
 *   → returns cancellation ID + refund_amount to show the user before confirming
 *
 * Step 2 — Confirm cancellation (this route, action: "confirm"):
 *   POST /air/order_cancellations/{cancellation_id}/actions/confirm
 *   → refund is initiated, order is cancelled
 */

const createSchema = z.object({
  action: z.literal('create'),
  order_id: z.string().min(1),
})

const confirmSchema = z.object({
  action: z.literal('confirm'),
  cancellation_id: z.string().min(1),
})

const bodySchema = z.discriminatedUnion('action', [createSchema, confirmSchema])

interface DuffelAirlineCredit {
  passenger_id: string
  credit_name: string
  credit_currency: string
  credit_amount: string
  /** Null until cancellation is confirmed — send to passenger after confirmation */
  credit_code: string | null
}

interface DuffelCancellationResponse {
  data: {
    id: string
    order_id: string
    refund_amount?: string | null
    refund_currency?: string | null
    /** "original_form_of_payment" | "airline_credits" | "voucher" | "awaiting_payment" */
    refund_to?: string | null
    expires_at?: string | null
    confirmed_at?: string | null
    created_at?: string
    airline_credits?: DuffelAirlineCredit[] | null
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    if (parsed.data.action === 'create') {
      // Step 1: create the cancellation — returns refund amount for user confirmation
      const result = await duffelPost<DuffelCancellationResponse>('/air/order_cancellations', {
        data: { order_id: parsed.data.order_id },
      })

      const c = result.data
      return NextResponse.json({
        cancellation_id: c.id,
        order_id: c.order_id,
        refund_amount: c.refund_amount ?? '0.00',
        refund_currency: c.refund_currency ?? null,
        refund_to: c.refund_to ?? null,
        expires_at: c.expires_at ?? null,
        // Included when refund_to === "airline_credits" — credit_code is null until confirmed
        airline_credits: c.airline_credits ?? null,
      })
    } else {
      // Step 2: confirm the cancellation — triggers the refund
      const result = await duffelPost<DuffelCancellationResponse>(
        `/air/order_cancellations/${parsed.data.cancellation_id}/actions/confirm`,
        {}
      )

      const c = result.data
      return NextResponse.json({
        cancelled: true,
        cancellation_id: c.id,
        order_id: c.order_id,
        refund_amount: c.refund_amount ?? '0.00',
        refund_currency: c.refund_currency ?? null,
        refund_to: c.refund_to ?? null,
        confirmed_at: c.confirmed_at ?? null,
        // credit_code is populated after confirmation — send each code to the passenger
        airline_credits: c.airline_credits ?? null,
      })
    }
  } catch (err) {
    console.error('[Cancel] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cancellation failed' },
      { status: 502 }
    )
  }
}
