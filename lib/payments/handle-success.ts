// lib/payments/handle-success.ts
// Shared post-payment orchestrator for Trip checkout flows.
//
// Called by Flutterwave and Paystack webhooks when a Trip payment is confirmed.
// Stripe's checkout.session.completed already handles bookCartActivities; this
// module adds the work that was missing for non-Stripe providers and adds Jade
// attribution across all providers.
//
// All steps are individually idempotent — safe to retry on duplicate webhook delivery.
//
// SECURITY: never logs or emits partnerNetPrice, rateKey, or supplier credentials.

import prisma                                             from '@/lib/db'
import { propagateJadeAttribution, trackCommercialEvent } from '@/lib/commercial/track'
import { bookCartActivities }                             from '@/lib/activities/booking'
import type { CartItemCompact }                           from '@/lib/activities/booking'

export interface TripPaymentOpts {
  provider:          string              // 'FLUTTERWAVE' | 'PAYSTACK' | 'BANK_TRANSFER'
  providerPaymentId: string              // provider's authoritative payment/transaction ID
  tripId:            string | null       // walz_trip_id from payment metadata
  sessionId:         string | null       // walz_session_id (CartSession.sessionId)
  leadId:            string | null       // walz_lead_id from payment metadata
  jadeAssisted:      boolean             // jade_assisted === 'true' from metadata
  amount:            number              // payment amount (major units)
  currency:          string              // ISO 4217, uppercased
  holder?:           { name: string; email: string; phone?: string }
}

export async function handleSuccessfulTripPayment(opts: TripPaymentOpts): Promise<void> {
  const { provider, providerPaymentId, tripId, sessionId, leadId, jadeAssisted, amount, currency } = opts

  // ── 1. CartSession.convertedAt ───────────────────────────────────────────────
  // Idempotent via WHERE convertedAt IS NULL.
  if (sessionId) {
    prisma.cartSession.updateMany({
      where: { sessionId, convertedAt: null },
      data:  { convertedAt: new Date() },
    }).catch(() => {})
  }

  // ── 2. Jade attribution — propagateJadeAttribution ───────────────────────────
  // Updates Booking.jadeAssisted = true on the Lead's qualifying booking.
  // For self-service trip checkouts there is typically no Booking record, so this
  // is usually a no-op. jade_checkout_converted (below) is the primary signal.
  if (jadeAssisted && leadId) {
    propagateJadeAttribution(providerPaymentId, leadId).catch(() => {})
  }

  // ── 3. jade_checkout_converted event (deduplicated via eventId unique index) ─
  if (jadeAssisted) {
    const dedupeKey = `jade_checkout_converted:${provider}:${providerPaymentId}`.slice(0, 64)
    // trackCommercialEvent catches P2002 internally — safe to fire without try/catch
    trackCommercialEvent('jade_checkout_converted', {
      eventId:  dedupeKey,
      leadId:   leadId ?? undefined,
      currency,
      amount,
      metadata: { provider, providerPaymentId, tripId, sessionId },
    })
  }

  // ── 4. Activity supplier booking ─────────────────────────────────────────────
  // Query ACTIVITY/viator TripItems and dispatch to Viator.
  // bookCartActivities is idempotent via (stripeSessionId, cartItemId) unique index;
  // for non-Stripe providers we pass providerPaymentId as the session key.
  if (!tripId) return

  let holder = opts.holder
  if (!holder?.email && leadId) {
    try {
      const lead = await prisma.lead.findUnique({
        where:  { id: leadId },
        select: { email: true, name: true, whatsapp: true },
      })
      if (lead) {
        holder = {
          name:  lead.name     ?? 'Valued Customer',
          email: lead.email    ?? '',
          phone: lead.whatsapp ?? undefined,
        }
      }
    } catch { /* non-fatal */ }
  }
  holder ??= { name: 'Valued Customer', email: '' }

  try {
    const tripItems = await prisma.tripItem.findMany({
      where:  { tripId },
      select: {
        id: true, type: true, title: true, cost: true, currency: true,
        sourceType: true, sourceId: true, location: true, startTime: true,
        metadata: true,
      },
    })

    const activityItems = tripItems.filter(
      i => i.type.toUpperCase() === 'ACTIVITY' && i.sourceType?.toLowerCase() === 'viator'
    )
    if (activityItems.length === 0) return

    const cartItems: CartItemCompact[] = activityItems.map((item, idx) => {
      const meta = (
        typeof item.metadata === 'object' && item.metadata && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : {}
      ) as Record<string, unknown>

      return {
        cid:   String(idx),
        tid:   item.id,
        t:     'activity',
        title: item.title,
        s:     'VIATOR',
        pc:    ((item.sourceId ?? meta.productCode) as string | undefined) ?? '',
        poc:   (meta.productOptionCode as string | undefined) ?? '',
        d:     (
          (meta.travelDate as string | undefined) ??
          (item.startTime ? item.startTime.slice(0, 10) : '')
        ),
        a:     Number(meta.adults   ?? 1),
        c:     Number(meta.children ?? 0),
        i:     Number(meta.infants  ?? 0),
        st:    (meta.startTime as string | undefined) ?? '',
        p:     item.cost ?? 0,
        cur:   item.currency,
        loc:   (item.location ?? '').slice(0, 30),
        dur:   ((meta.duration as string | undefined) ?? '').slice(0, 20),
      }
    })

    await bookCartActivities(
      cartItems,
      holder,
      providerPaymentId,  // passed as stripeSessionId — used as idempotency key
      amount,
      currency,
      tripId,
    )
  } catch (err) {
    console.error(`[TripPayment] bookCartActivities failed for ${provider}:${providerPaymentId}:`, err)
  }
}
