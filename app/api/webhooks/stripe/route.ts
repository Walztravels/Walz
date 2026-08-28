import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { constructWebhookEvent } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { ensureClientAccount } from '@/lib/create-client-account'
import { getSupabaseAdmin }    from '@/lib/supabase'
import { getConfig }           from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter }  from '@/lib/concierge/suppliers/comfortpass/adapter'
import type { CPPassenger }    from '@/lib/concierge/suppliers/comfortpass/types'
import { bookCartActivities, parseCartItems } from '@/lib/activities/booking'
import { trackCommercialEvent, recordCrossSellPurchased, recordPostBookingUpsellPurchased, propagateJadeAttribution } from '@/lib/commercial/track'
import { recordPaymentSucceeded } from '@/lib/commercial/payment'
import { setTripPaid } from '@/lib/trips/lifecycle'
import { createOrUpdateOpportunity, markCartRecovered, resolveAssignment } from '@/lib/recovery/opportunity'
import { calculatePriority } from '@/lib/recovery/scoring'
// booking_confirmed fires from the supplier confirmation path (bookCartActivities), not here.
// cross_sell_purchased / post_booking_upsell_purchased for ACTIVITY items fire from bookCartActivities on supplier CONFIRMED.
// For non-activity items (HOTEL, FLIGHT, TRANSFER, ESIM) there is no supplier confirmation step —
// payment IS the authoritative event, so we fire those events here.


// ── Concierge airport service — post-payment booking dispatch ─────────────────

async function handleConciergeAirportPayment(session: Stripe.Checkout.Session): Promise<void> {
  const { request_id, walz_ref } = session.metadata ?? {}
  if (!request_id || !walz_ref) {
    console.error('[ConciergeAirport] Missing metadata on checkout session', session.id)
    return
  }

  const supabase = getSupabaseAdmin()

  // Load the stored booking intent
  const { data: reqRow, error } = await supabase
    .from('concierge_requests')
    .select('id, intent_fields, status')
    .eq('id', request_id)
    .single()

  if (error || !reqRow) {
    console.error('[ConciergeAirport] Request not found:', request_id, error?.message)
    return
  }

  if (reqRow.status === 'confirmed') {
    // Already processed (idempotent retry from Stripe)
    return
  }

  // Update status to confirmed and record Stripe session
  await supabase
    .from('concierge_requests')
    .update({
      status:            'confirmed',
      stripe_session_id: session.id,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', request_id)

  // Check CP is enabled before dispatching
  const config = getConfig()
  if (!config) {
    console.error('[ConciergeAirport] ComfortPass not enabled — booking confirmed but not dispatched:', walz_ref)
    return
  }

  // Build dispatch payload from stored intent_fields
  const fields  = (reqRow.intent_fields ?? {}) as Record<string, unknown>
  const adapter = new ComfortPassAdapter()

  const passengers: CPPassenger[] = (
    Array.isArray(fields.passengers) ? fields.passengers : []
  ).map((p: Record<string, unknown>) => ({
    type:      (p.type as 'adult' | 'child' | 'infant') ?? 'adult',
    firstName: (p.firstName as string) ?? 'Guest',
    lastName:  (p.lastName  as string) ?? 'Traveller',
  }))

  if (passengers.length === 0) {
    passengers.push({ type: 'adult', firstName: 'Guest', lastName: 'Traveller' })
  }

  const result = await adapter.dispatch({
    requestId:        request_id,
    requestReference: walz_ref,
    category: {
      id:              '',
      slug:            'airport-services',
      name:            'Airport Services',
      description:     '',
      fulfilmentModes: ['instant'],
      requiredFields:  [],
      isActive:        true,
      displayOrder:    0,
      metadata:        {},
    },
    supplier: {
      id:            '',
      slug:          'comfortpass',
      name:          'ComfortPass',
      adapterType:   'comfortpass',
      categorySlugs: ['airport-services'],
      isActive:      true,
      metadata:      {},
    },
    fulfilmentMode: 'instant',
    fields: {
      service_code:  fields.service_code,
      airport_code:  fields.airport_code,
      date:          fields.date,
      time:          fields.time          ?? '00:00',
      flight_number: fields.flight_number ?? '',
      passengers,
    },
    clientName:  (fields.passengers as CPPassenger[])?.[0]
      ? `${(fields.passengers as CPPassenger[])[0].firstName} ${(fields.passengers as CPPassenger[])[0].lastName}`
      : undefined,
    clientEmail: fields.lead_email as string | undefined,
    clientPhone: fields.lead_phone as string | undefined,
  }).catch(err => {
    console.error('[ConciergeAirport] Dispatch failed:', (err as Error).message)
    return null
  })

  if (result?.success) {
    console.info(`[ConciergeAirport] Booking dispatched: ${walz_ref} → supplier ref ${result.supplierRef}`)
  } else {
    console.error(`[ConciergeAirport] Dispatch failed for ${walz_ref}:`, result?.error)
    // Status stays 'confirmed' — ops team will follow up via admin panel
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = await constructWebhookEvent(body, signature)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        console.log(`[Stripe Webhook] Payment cancelled: ${paymentIntent.id}`)

        // Card authorization release
        const cancelledAuth = await prisma.cardAuthorization.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
        })
        if (cancelledAuth && (cancelledAuth.status === 'authorized' || cancelledAuth.status === 'pending')) {
          await prisma.cardAuthorization.update({
            where: { id: cancelledAuth.id },
            data: { status: 'released', releasedAt: new Date() },
          })
          break
        }

        await prisma.booking.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { paymentStatus: 'CANCELLED', status: 'CANCELLED' },
        })

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge

        console.log(`[Stripe Webhook] Charge refunded: ${charge.id}`)

        if (charge.payment_intent) {
          await prisma.booking.updateMany({
            where: {
              stripePaymentIntentId: charge.payment_intent as string,
            },
            data: {
              paymentStatus: 'REFUNDED',
              status: 'CANCELLED',
            },
          })
        }

        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // Mark CartSession as paid-converted — only when Stripe confirms payment was collected.
        // convertedAt = successful payment, NOT supplier booking confirmation.
        // booking_confirmed fires later from the supplier confirmation path (bookCartActivities).
        if (session.metadata?.walz_session_id && session.payment_status === 'paid') {
          try {
            const converted = await prisma.cartSession.findFirst({
              where:  { sessionId: session.metadata.walz_session_id },
              select: { id: true, totalAmount: true, currency: true },
            })
            await prisma.cartSession.updateMany({
              where: { sessionId: session.metadata.walz_session_id, convertedAt: null },
              data:  { convertedAt: new Date() },
            })
            // 3A: If this cart had an ABANDONED_CART recovery opportunity, mark it RECOVERED.
            if (converted) {
              markCartRecovered(
                converted.id,
                converted.totalAmount ?? 0,
                (converted.currency ?? 'GBP').toUpperCase(),
                session.id,
              ).catch(() => {})
            }
          } catch {
            console.warn('[CartSession] conversion update failed (non-fatal)')
          }
        }

        // Advance Trip to PAID — payment provider has authoritatively confirmed payment.
        // Fires for all cart checkouts (walz_trip_id in metadata).
        // Non-fatal: lifecycle helpers never throw.
        if (session.payment_status === 'paid' && (session.metadata?.walz_trip_id || session.metadata?.walz_session_id)) {
          void setTripPaid({
            tripId:    session.metadata?.walz_trip_id    ?? null,
            sessionId: session.metadata?.walz_session_id ?? null,
          })
        }

        // ── Jade attribution (4D.1) ──────────────────────────────────────────────
        // When checkout originated from a Jade-assisted session, propagate attribution
        // and fire jade_checkout_converted after authoritative payment confirmation.
        if (session.payment_status === 'paid' && session.metadata?.jade_assisted === 'true') {
          const jadeLead   = session.metadata?.walz_lead_id  ?? null
          const jadeTripId = session.metadata?.walz_trip_id  ?? null

          // propagateJadeAttribution updates Booking.jadeAssisted for admin-created bookings.
          // For self-service Trip checkouts (no Booking record) this is a no-op; the event
          // below is the authoritative attribution signal.
          if (jadeLead) {
            propagateJadeAttribution(session.id, jadeLead).catch(() => {})
          }

          // jade_checkout_converted — deduplicated via eventId unique index
          prisma.commercialEvent.create({
            data: {
              eventId:  `jade_checkout_converted:STRIPE:${session.id}`.slice(0, 64),
              event:    'jade_checkout_converted',
              leadId:   jadeLead ?? undefined,
              currency: session.currency?.toUpperCase() ?? undefined,
              amount:   (session.amount_total ?? 0) / 100,
              metadata: { stripeSessionId: session.id, tripId: jadeTripId },
            },
          }).catch(() => {}) // P2002 on duplicate → silent no-op
        }

        // Visa application service fee
        if (session.metadata?.applicationId) {
          const app = await prisma.visaApplication.update({
            where: { id: session.metadata.applicationId },
            data:  { serviceFeePaid: true, status: 'documents_pending' },
          })
          console.log('[Stripe Webhook] Visa payment confirmed:', session.metadata.applicationId)

          // Auto-create client portal account after payment
          const email = app.email ?? session.customer_email
          if (email) {
            const fullName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Client'
            await ensureClientAccount({ email, name: fullName, phone: app.phone ?? null, applicationId: app.id })
          }
        }

        // Concierge airport service payment
        if (session.metadata?.type === 'concierge_airport') {
          await handleConciergeAirportPayment(session)
        }

        // Activity booking — legacy single-item path (old metadata.type flag)
        if (session.metadata?.type === 'activity_booking') {
          await prisma.activityBooking.create({
            data: {
              clientName:      session.metadata.clientName  || 'Unknown',
              clientEmail:     session.metadata.clientEmail || session.customer_email || '',
              activityTitle:   session.metadata.activityTitle || null,
              location:        session.metadata.location || null,
              travelDate:      session.metadata.travelDate || null,
              adults:          parseInt(session.metadata.adults || '1'),
              totalAmount:     (session.amount_total ?? 0) / 100,
              currency:        session.currency?.toUpperCase() ?? 'GBP',
              stripeSessionId: session.id,
              status:          'CONFIRMED',
              paymentStatus:   'PAID',
            },
          })
        }

        // Cart activity booking — new multi-item path (item_count in metadata)
        // Calls supplier APIs and manages full booking lifecycle.
        // This is the authoritative trusted trigger; the browser redirect is read-only.
        if (session.metadata?.item_count) {
          const items  = parseCartItems(session.metadata)
          const hasActivity = items.some(i => i.t === 'activity')

          if (hasActivity) {
            const holder = {
              name:  session.customer_details?.name  ?? 'Valued Customer',
              email: session.customer_details?.email ?? session.customer_email ?? '',
              phone: session.customer_details?.phone ?? undefined,
            }
            const total    = (session.amount_total ?? 0) / 100
            const currency = (session.currency ?? 'GBP').toUpperCase()

            // Run supplier booking within the webhook. bookCartActivities is idempotent.
            // Webhook must return 200 in ≤30s — supplier calls have their own 25s timeout.
            await bookCartActivities(items, holder, session.id, total, currency, session.metadata?.walz_trip_id ?? null)
              .catch(err => console.error('[Stripe Webhook] Cart activity booking error:', err))
          }

          // ── Non-activity purchase attribution (2D.1.1) ──────────────────────────
          // HOTEL, FLIGHT, TRANSFER, ESIM: no supplier confirmation step exists in the
          // current system. Payment = authoritative. Fire cross_sell_purchased /
          // post_booking_upsell_purchased here, idempotent via eventId.
          const nonActivityAttributed = items.filter(
            i => i.t !== 'activity' && i.tid && (i.cs === 'cross_sell' || i.cs === 'post_booking_upsell')
          )
          const sessionCurrency = (session.currency ?? 'GBP').toUpperCase()

          for (const item of nonActivityAttributed) {
            const opts = {
              tripItemId:  item.tid!,
              bookingId:   session.id,
              productType: item.t ?? 'unknown',
              amount:      item.p ?? 0,
              currency:    item.cur || sessionCurrency,
            }
            if (item.cs === 'cross_sell') {
              recordCrossSellPurchased(opts)
                .catch(err => console.warn('[CommercialEvent] cross_sell_purchased (non-activity) failed:', (err as Error).message))
            } else {
              recordPostBookingUpsellPurchased(opts)
                .catch(err => console.warn('[CommercialEvent] post_booking_upsell_purchased (non-activity) failed:', (err as Error).message))
            }
          }
        }

        break
      }

      case 'payment_intent.amount_capturable_updated': {
        // Fires when a manual-capture PaymentIntent moves to requires_capture (card authorized).
        const pi = event.data.object as Stripe.PaymentIntent
        const cardAuth = await prisma.cardAuthorization.findUnique({
          where: { stripePaymentIntentId: pi.id },
        })
        if (cardAuth && cardAuth.status === 'pending') {
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          await prisma.cardAuthorization.update({
            where: { id: cardAuth.id },
            data: {
              status:       'authorized',
              authorizedAt: new Date(),
              expiresAt,
            },
          })
          try {
            await prisma.cardAuthorizationEvent.create({
              data: {
                authorizationId: cardAuth.id,
                eventType:       'AUTHORIZED',
                amountMinor:     BigInt(pi.amount_capturable ?? 0),
                currency:        pi.currency,
                stripeEventId:   event.id,
              },
            })
          } catch (evErr: unknown) {
            const isDup = evErr instanceof Error && 'code' in evErr && (evErr as { code: string }).code === 'P2002'
            if (!isDup) console.error('[Stripe Webhook] AUTHORIZED event insert failed:', evErr)
          }
          console.log(`[Stripe Webhook] Card authorized: ${cardAuth.id} (PI: ${pi.id})`)
        }
        break
      }

      // ── Credit Card Authorization: SetupIntent succeeded ──────────────────────
      case 'setup_intent.succeeded': {
        const si = event.data.object as Stripe.SetupIntent
        const authId = si.metadata?.authorizationId
        if (!authId) break

        const cca = await prisma.creditCardAuthorization.findFirst({
          where: { setupIntentId: si.id },
        })
        if (!cca || !['sent', 'opened', 'active'].includes(cca.status)) break

        const pm = si.payment_method as string | null
        if (!pm) break

        try {
          const pmDetails = await (await import('@/lib/stripe')).retrievePaymentMethod(pm)
          const card = pmDetails.card
          await prisma.creditCardAuthorization.update({
            where: { id: cca.id },
            data: {
              stripePaymentMethodId: pm,
              cardBrand:    card?.brand,
              cardLast4:    card?.last4,
              cardExpMonth: card?.exp_month,
              cardExpYear:  card?.exp_year,
              status:       cca.status === 'active' ? 'active' : 'active',
              signedAt:     cca.signedAt ?? new Date(),
            },
          })
          await prisma.creditCardAuthorizationEvent.create({
            data: {
              authorizationId: cca.id,
              eventType:       'CARD_SAVED',
              stripeEventId:   event.id,
            },
          }).catch(() => {})
        } catch (err) {
          console.error('[Stripe Webhook] setup_intent.succeeded CCA update failed:', err)
        }
        break
      }

      // ── Credit Card Authorization: off-session PI events ───────────────────────
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        // Card authorization capture — Stripe authoritatively confirms the capture
        const capturedAuth = await prisma.cardAuthorization.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
        })
        if (capturedAuth && ['authorized', 'captured'].includes(capturedAuth.status)) {
          // capturedAt: preserve if already set (idempotent retries); set now on first confirmation
          const capturedAt = capturedAuth.capturedAt ?? new Date()

          await prisma.cardAuthorization.update({
            where: { id: capturedAuth.id },
            data: {
              status:              'captured',
              capturedAt,
              // authoritative integer amount from Stripe — never a / 100 approximation
              capturedAmountMinor: BigInt(paymentIntent.amount_received),
              capturedAmount:      null, // clear legacy Float — capturedAmountMinor is canonical
            },
          })

          // CAPTURE_CONFIRMED is idempotent via stripeEventId unique constraint
          try {
            await prisma.cardAuthorizationEvent.create({
              data: {
                authorizationId: capturedAuth.id,
                eventType:       'CAPTURE_CONFIRMED',
                amountMinor:     BigInt(paymentIntent.amount_received),
                currency:        paymentIntent.currency,
                stripeEventId:   event.id,
              },
            })
          } catch (err: unknown) {
            // P2002 = unique constraint violation → duplicate webhook delivery; safe to skip
            const isUniqueViolation = err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002'
            if (!isUniqueViolation) throw err
            console.log(`[Stripe Webhook] Duplicate payment_intent.succeeded event ${event.id} — skipping audit`)
          }

          console.log(`[Stripe Webhook] Card captured (authoritative): ${capturedAuth.id}, amount_received=${paymentIntent.amount_received}`)
          break
        }

        // CCA off-session transaction
        const ccaTx = await prisma.creditCardAuthorizationTransaction.findUnique({
          where:   { stripePaymentIntentId: paymentIntent.id },
          include: { authorization: true },
        })
        if (ccaTx && ['processing', 'authentication_required', 'pending'].includes(ccaTx.status)) {
          try {
            await prisma.creditCardAuthorizationTransaction.update({
              where: { id: ccaTx.id },
              data: {
                status:        'paid',
                succeededAt:   new Date(),
                stripeChargeId: typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : undefined,
              },
            })

            const auth    = ccaTx.authorization
            const newTotal = Number(auth.totalChargedMinor) + Number(ccaTx.amountMinor)
            const newStatus = newTotal >= Number(auth.maxAmountMinor) ? 'fully_used' : 'partially_used'
            await prisma.creditCardAuthorization.update({
              where: { id: auth.id },
              data:  { totalChargedMinor: BigInt(newTotal), status: newStatus },
            })

            await prisma.creditCardAuthorizationEvent.create({
              data: {
                authorizationId: auth.id,
                eventType:       'CHARGE_SUCCEEDED',
                amountMinor:     ccaTx.amountMinor,
                currency:        ccaTx.currency,
                stripeEventId:   event.id,
                metadata:        { transactionId: ccaTx.id },
              },
            }).catch(() => {})

            console.log(`[Stripe Webhook] CCA charge confirmed: ${auth.reference}, tx=${ccaTx.id}`)
          } catch (err) {
            console.error('[Stripe Webhook] CCA charge update failed:', err)
          }
          break
        }

        console.log(`[Stripe Webhook] Payment succeeded: ${paymentIntent.id}`)

        // Package deposit payment
        if (paymentIntent.metadata?.type === 'deposit' && paymentIntent.metadata.booking_ref) {
          await prisma.$executeRawUnsafe(
            `UPDATE package_bookings
             SET payment_status = 'deposit_paid',
                 payment_gateway = 'stripe',
                 payment_intent_id = $1,
                 deposit_paid_at = NOW(),
                 deposit_amount_paid = $2,
                 payment_currency = $3,
                 updated_at = NOW()
             WHERE booking_ref = $4`,
            paymentIntent.id,
            paymentIntent.amount_received / 100,
            paymentIntent.currency,
            paymentIntent.metadata.booking_ref
          )
        } else {
          // Existing flight/tour booking handling
          const updated = await prisma.booking.updateMany({
            where: {
              stripePaymentIntentId: paymentIntent.id,
              paymentStatus: 'PENDING',
            },
            data: {
              paymentStatus: 'SUCCEEDED',
            },
          })

          // Track payment_succeeded via normalized helper — idempotent, deduplicates by PI id
          if (updated.count > 0) {
            recordPaymentSucceeded({
              provider:          'STRIPE',
              providerPaymentId: paymentIntent.id,
              amount:   paymentIntent.amount_received / 100,
              currency: paymentIntent.currency?.toUpperCase() ?? 'GBP',
              metadata: { bookingCount: updated.count },
            }).catch(err => console.warn('[Payment] Stripe payment_succeeded tracking failed:', (err as Error).message))
          }
        }

        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        // CCA off-session transaction failed
        const ccaTx = await prisma.creditCardAuthorizationTransaction.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
        })
        if (ccaTx && ['processing', 'authentication_required', 'pending'].includes(ccaTx.status)) {
          await prisma.creditCardAuthorizationTransaction.update({
            where: { id: ccaTx.id },
            data: {
              status:             'failed',
              failedAt:           new Date(),
              failureCode:        paymentIntent.last_payment_error?.code ?? undefined,
              safeFailureMessage: paymentIntent.last_payment_error?.message ?? 'Payment failed.',
            },
          }).catch(() => {})
          await prisma.creditCardAuthorizationEvent.create({
            data: {
              authorizationId: ccaTx.authorizationId,
              eventType:       'CHARGE_FAILED',
              amountMinor:     ccaTx.amountMinor,
              currency:        ccaTx.currency,
              stripeEventId:   event.id,
            },
          }).catch(() => {})
          console.log(`[Stripe Webhook] CCA charge failed: tx=${ccaTx.id}`)
          break
        }

        console.log(
          `[Stripe Webhook] Payment failed: ${paymentIntent.id}`,
          paymentIntent.last_payment_error?.message
        )

        await prisma.booking.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
          },
          data: {
            paymentStatus: 'FAILED',
            status: 'FAILED',
            notes: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown reason'}`,
          },
        })

        // 3A: Create FAILED_PAYMENT recovery opportunity (provider-authoritative — not a browser error).
        // Idempotent via dedupeKey = "FAILED_PAYMENT:<paymentIntentId>".
        if (process.env.RECOVERY_ENGINE_ENABLED === 'true') {
          const failedAmount = (paymentIntent.amount ?? 0) / 100
          const failedCurrency = (paymentIntent.currency ?? 'GBP').toUpperCase()
          const priority = calculatePriority({ type: 'FAILED_PAYMENT', amount: failedAmount })
          createOrUpdateOpportunity({
            type:        'FAILED_PAYMENT',
            reason:      `Stripe payment failed: ${paymentIntent.last_payment_error?.message ?? 'Unknown reason'}`,
            priority,
            amount:      failedAmount,
            currency:    failedCurrency,
            bookingId:   paymentIntent.id,  // payment intent ID as booking reference
            assignedToId: null,  // no lead context available from payment intent alone
          }).catch(err => console.warn('[Recovery] FAILED_PAYMENT opportunity failed:', (err as Error).message))
        }

        break
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true, type: event.type })
  } catch (error) {
    console.error('[Stripe Webhook] Handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
