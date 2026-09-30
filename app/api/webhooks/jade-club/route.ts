// app/api/webhooks/jade-club/route.ts — Jade Travel Club Release 2B: Stripe
// webhook handler for membership purchases. Isolated from the main
// app/api/webhooks/stripe/route.ts on purpose — a dedicated, small,
// legible endpoint with its own signing secret (matching the precedent in
// app/api/webhooks/stripe-itinerary/route.ts).
//
// Verifies the Stripe signature FIRST. Looks up JadeClubPurchase by
// (provider, providerReference) ONLY — see
// lib/jade-club/purchase-activation.ts::recordCheckoutSessionPaid — never
// by a client-echoed id. Always acks Stripe with 200 once the signature is
// verified, regardless of downstream outcome (matching the Paystack
// webhook's always-200-then-work-idempotently-internally precedent) — a
// PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING row is left behind for the
// reconciliation job on any downstream failure, never silently dropped.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  recordCheckoutSessionPaid,
  recordCheckoutSessionFailed,
  recordRefund,
  attemptActivation,
} from '@/lib/jade-club/purchase-activation'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_JADE_CLUB_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[jade-club-webhook] no webhook secret configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? '', webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.warn('[jade-club-webhook] BLOCKED: signature verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature error: ${msg}` }, { status: 400 })
  }

  // Signature verified — ack Stripe with 200 from here on regardless of
  // what happens inside; internal errors are logged and left for the
  // reconciliation job, never surfaced as a retry-inducing non-200.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.source !== 'jade_club_membership_purchase') break // not ours — ignore

        if (session.payment_status !== 'paid') break // async payment method still pending — a later event will confirm

        const result = await recordCheckoutSessionPaid({
          providerReference: session.id,
          amountTotalMinor: session.amount_total ?? -1,
          currency: (session.currency ?? '').toUpperCase(),
          purchaseIdHint: session.metadata?.purchaseId ?? null,
        })

        if (result.outcome === 'CONFIRMED_PENDING_ACTIVATION') {
          await attemptActivation(result.purchaseId)
        }
        // PURCHASE_NOT_FOUND / DUPLICATE_IGNORED / AMOUNT_MISMATCH: no
        // further action here — DUPLICATE_IGNORED is the expected shape of
        // a duplicate delivery; PURCHASE_NOT_FOUND is logged by the
        // function itself via its own internal path only when relevant.
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.source !== 'jade_club_membership_purchase') break
        await recordCheckoutSessionFailed(session.id, 'SESSION_EXPIRED')
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
        if (!paymentIntentId) break

        // Our JadeClubPurchase.providerReference stores the Checkout
        // Session id, not the PaymentIntent/Charge id — resolve back to
        // the session id via Stripe's own API (never trust anything from
        // the browser for this correlation).
        const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 })
        const relatedSession = sessions.data[0]
        if (!relatedSession || relatedSession.metadata?.source !== 'jade_club_membership_purchase') break

        await recordRefund(relatedSession.id)
        break
      }

      default:
        break // not a Jade Club purchase event
    }
  } catch (err) {
    console.error('[jade-club-webhook] internal error handling', event.type, ':', err instanceof Error ? err.message : err)
    // Fall through to the 200 ack below — Stripe must not be asked to
    // retry the whole webhook forever; the reconciliation job owns retry.
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
