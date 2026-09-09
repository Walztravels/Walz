import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = 'gbp', metadata, offerId } = await req.json()

    // ── Amount authority: bounded by the live Duffel offer ──────────────────
    // amount arrives in MINOR units. It may include seats/extras above the
    // fare but can never be below it, nor implausibly above; currency must
    // be the offer's own. Requests that identify a flight offer without
    // passing this check are refused.
    const offerRef = offerId ?? metadata?.itinerary_id
    if (typeof offerRef === 'string' && offerRef.startsWith('off_')) {
      try {
        const { duffelGet } = await import('@/lib/duffel/client')
        const offer = await duffelGet<{ data?: { total_amount?: string; total_currency?: string } }>(`/air/offers/${offerRef}`)
        const fareTotal    = Number(offer.data?.total_amount)
        const fareCurrency = (offer.data?.total_currency ?? '').toLowerCase()
        if (!Number.isFinite(fareTotal) || fareTotal <= 0) throw new Error('offer total missing')
        const fareMinor = Math.round(fareTotal * 100)
        if (String(currency).toLowerCase() !== fareCurrency) {
          return NextResponse.json({ error: 'Currency does not match the flight offer.' }, { status: 409 })
        }
        const amtMinor = Math.round(Number(amount))
        if (!Number.isFinite(amtMinor) || amtMinor < fareMinor - 1 || amtMinor > fareMinor * 2) {
          return NextResponse.json(
            { error: 'Amount does not match the flight offer. Please refresh and try again.' },
            { status: 409 },
          )
        }
      } catch (err) {
        console.error('[checkout/intent] offer verification failed:', err instanceof Error ? err.message : err)
        return NextResponse.json(
          { error: 'Flight offer could not be verified. Please refresh your search.' },
          { status: 409 },
        )
      }
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        clientSecret: 'pi_dev_mock_secret_test',
        intentId:     'pi_dev_mock',
        source:       'mock',
      })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const intent = await stripe.paymentIntents.create({
      amount:   Math.round(Number(amount)),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: metadata ?? {},
    })

    return NextResponse.json({
      clientSecret: intent.client_secret,
      intentId:     intent.id,
      source:       'stripe',
    })
  } catch (err) {
    console.error('[checkout/intent] Error:', err)
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 })
  }
}
