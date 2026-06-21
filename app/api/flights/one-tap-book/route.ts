import { NextRequest, NextResponse } from 'next/server'
import { duffelPost }               from '@/lib/duffel/client'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/flights/one-tap-book
 *
 * Called ONLY after /api/payments/charge succeeds.
 * Creates a Duffel order using balance payment (Walz Travels' Duffel balance —
 * the customer has already been charged via Stripe on the server).
 *
 * Body:
 *   offerId          string
 *   paymentIntentId  string            (Stripe PaymentIntent ID — stored for audit)
 *   total            number
 *   currency         string
 *   passengers       DuffelPassenger[]
 *   passengerEmail   string
 *   passengerName    string
 *
 * Returns:
 *   { bookingRef, orderId }   on success
 *   { error }                 on Duffel failure
 *
 * Security: payment must have been captured BEFORE this is called.
 * This route does not touch Stripe — it only creates the airline order.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const {
    offerId,
    paymentIntentId,
    total,
    currency = 'GBP',
    passengers,
  } = body as {
    offerId:         string
    paymentIntentId: string
    total:           number
    currency:        string
    passengers:      {
      id: string; given_name: string; family_name: string
      born_on: string; gender: 'm' | 'f'; title: string
      email: string; phone_number: string
    }[]
  }

  if (!offerId || !passengers?.length) {
    return NextResponse.json({ error: 'offerId and passengers required' }, { status: 400 })
  }

  try {
    const duffelPayload = {
      data: {
        selected_offers: [offerId],
        passengers:      passengers.map(p => ({
          id:           p.id,
          given_name:   p.given_name,
          family_name:  p.family_name,
          born_on:      p.born_on,
          gender:       p.gender,
          title:        p.title,
          email:        p.email,
          phone_number: p.phone_number,
        })),
        // Walz Travels pays Duffel from its own balance — the passenger was
        // charged via Stripe before this route was called.
        payments: [{
          type:     'balance',
          currency: currency.toUpperCase(),
          amount:   total.toFixed(2),
        }],
        metadata: {
          walz_payment_intent_id: paymentIntentId,
          walz_booking_source:    'one_tap',
        },
      },
    }

    const response = await duffelPost('/air/orders', duffelPayload) as {
      data?: {
        id: string
        booking_reference: string
        total_amount: string
        total_currency: string
      }
      errors?: { title: string; message: string }[]
    }

    if (response.errors?.length || !response.data?.booking_reference) {
      const msg = response.errors?.[0]?.message ?? 'Duffel order creation failed'
      console.error('[one-tap-book] Duffel error after Stripe success:', {
        paymentIntentId,
        offerId,
        duffelErrors: response.errors,
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    return NextResponse.json({
      bookingRef: response.data.booking_reference,
      orderId:    response.data.id,
      total:      response.data.total_amount,
      currency:   response.data.total_currency,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[one-tap-book] Unexpected error:', { paymentIntentId, offerId, err: msg })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
