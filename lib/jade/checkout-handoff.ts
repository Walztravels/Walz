// lib/jade/checkout-handoff.ts
// Release 4D-A — Jade checkout handoff.
//
// prepare_trip_checkout validates a Trip for checkout and generates a signed,
// short-lived review URL. Jade never handles payment; it only prepares the URL.
//
// SECURITY invariants:
//   - Ownership validated before any access
//   - Stale items block checkout
//   - Purchased/confirmed items excluded from new checkout
//   - Prices always from DB — never from Jade input
//   - Token is HMAC-signed, owner-scoped, 30-minute TTL
//   - Jade may NOT submit: amount, currency, discount, markup, payment credentials

import type { Prisma }            from '@prisma/client'
import prisma                     from '@/lib/db'
import { revalidateAllTripItems } from '@/lib/checkout/revalidate-trip'
import { createCheckoutToken }    from '@/lib/checkout/token'
import { trackCommercialEvent }   from '@/lib/commercial/track'
import type { JadeTripToolContext } from './trip-tools'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// Only cartable types can be part of a Jade checkout
const CART_ELIGIBLE_TYPES = new Set(['ACTIVITY', 'TRANSFER', 'TRANSPORT', 'HOTEL', 'FLIGHT'])

export async function prepareJadeTripCheckout(
  input: Record<string, unknown>,
  ctx:   JadeTripToolContext,
): Promise<string> {
  const tripId = typeof input.trip_id === 'string' ? input.trip_id.trim() : null
  if (!tripId) return JSON.stringify({ error: 'trip_id is required' })

  if (!ctx.userId && !ctx.sessionId) {
    return JSON.stringify({ error: 'Must be signed in or have an active session to proceed to checkout.' })
  }

  // ── Ownership ───────────────────────────────────────────────────────────────
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
          cost:       true,
          currency:   true,
          confirmed:  true,
          bookingRef: true,
          sourceType: true,
          sourceId:   true,
          // metadata is Prisma.JsonValue — do not cast, pass as-is to revalidateAllTripItems
          metadata:   true,
        },
      },
    },
  })

  if (!trip) return JSON.stringify({ error: 'Trip not found or access denied' })

  const isOwner =
    (ctx.userId   && trip.userId    === ctx.userId)   ||
    (!ctx.userId  && ctx.sessionId  && trip.sessionId === ctx.sessionId)
  if (!isOwner) return JSON.stringify({ error: 'Trip not found or access denied' })

  // ── jade_checkout_requested (fires only for validated owners) ────────────────
  void trackCommercialEvent('jade_checkout_requested', {
    leadId:   trip.leadId ?? undefined,
    metadata: { tripId, source: 'jade_tool' },
  })

  // ── Lifecycle guard ─────────────────────────────────────────────────────────
  // Only DRAFT/PLANNING trips can initiate a new checkout
  if (!['DRAFT', 'PLANNING', 'CHECKOUT_STARTED'].includes(trip.status)) {
    return JSON.stringify({
      status: 'BLOCKED',
      reason: `This trip is already in ${trip.status} status and cannot be checked out again.`,
    })
  }

  // ── Eligible items ──────────────────────────────────────────────────────────
  const eligible = trip.items.filter(i => CART_ELIGIBLE_TYPES.has(i.type.toUpperCase()))
  if (eligible.length === 0) {
    return JSON.stringify({
      status: 'BLOCKED',
      reason: 'There are no checkout-eligible items in this trip. Add flights, hotels, activities, or transfers first.',
    })
  }

  // ── Multi-currency guard ────────────────────────────────────────────────────
  const currencies = [...new Set(
    eligible
      .filter(i => !i.confirmed && !i.bookingRef)  // unpurchased only
      .map(i => (i.currency || trip.currency).toUpperCase())
  )]
  if (currencies.length > 1) {
    return JSON.stringify({
      status: 'BLOCKED',
      reason: `Your trip contains items in multiple currencies (${currencies.join(', ')}). Checkout requires a single currency. Please remove or adjust items until all unpurchased items share one currency.`,
      currencies,
    })
  }

  // ── Revalidation ────────────────────────────────────────────────────────────
  // Runs against all eligible items: flights (expiry), hotels (checkrate), activities (viator)
  const revalResult = await revalidateAllTripItems(eligible)

  // ── Commercial event ────────────────────────────────────────────────────────
  prisma.commercialEvent.create({
    data: {
      event:    revalResult.status === 'READY' ? 'jade_checkout_ready' :
                revalResult.status === 'ACTION_REQUIRED' ? 'jade_checkout_price_changed' :
                'jade_checkout_blocked',
      userId:   ctx.userId ?? null,
      leadId:   trip.leadId ?? undefined,
      metadata: {
        tripId,
        overallStatus: revalResult.status,
        eligibleCount: revalResult.eligibleCount,
        priceChangedCount: revalResult.priceChangedCount,
        blockedCount: revalResult.blockedCount,
        source: 'jade_chat',
      },
    },
  }).catch(() => {})

  // ── BLOCKED — sold out, expired, stale ─────────────────────────────────────
  if (revalResult.status === 'BLOCKED') {
    const soldOut  = revalResult.items.filter(i => i.status === 'SOLD_OUT')
    const expired  = revalResult.items.filter(i => i.status === 'EXPIRED')
    const stale    = revalResult.items.filter(i => i.status === 'STALE')

    return JSON.stringify({
      status: 'BLOCKED',
      issues: [
        ...soldOut.map(i => ({ type: 'SOLD_OUT',  title: i.title, reason: 'No longer available — please find a replacement' })),
        ...expired.map(i => ({ type: 'EXPIRED',   title: i.title, reason: 'Flight offer expired — please search for current fares' })),
        ...stale.map(i   => ({ type: 'STALE',     title: i.title, reason: `Prices may be invalid (${i.reason}) — please re-search` })),
      ],
      message: buildBlockedMessage(soldOut.length, expired.length, stale.length),
    })
  }

  // ── ACTION_REQUIRED — price changes ────────────────────────────────────────
  // Still generate the review URL so the customer can accept changes on the page
  const ownerId     = ctx.userId ?? ctx.sessionId!
  const token       = createCheckoutToken(tripId, ownerId)
  const reviewUrl   = `${SITE}/checkout/trip/${tripId}?ct=${encodeURIComponent(token)}`

  if (revalResult.status === 'ACTION_REQUIRED') {
    const changed = revalResult.items.filter(i => i.status === 'PRICE_CHANGED')
    const failed  = revalResult.items.filter(i => i.status === 'REVALIDATION_FAILED')

    return JSON.stringify({
      status:     'ACTION_REQUIRED',
      reviewUrl,
      priceChanges: changed.map(i => ({
        title:         i.title,
        previousPrice: i.previousPrice,
        latestPrice:   i.latestPrice,
        currency:      i.currency,
      })),
      revalidationErrors: failed.map(i => ({ title: i.title, reason: i.reason })),
      message: buildActionRequiredMessage(changed, failed),
    })
  }

  // ── READY ───────────────────────────────────────────────────────────────────
  const total = eligible
    .filter(i => !i.confirmed && !i.bookingRef)
    .reduce((s, i) => s + (i.cost ?? 0), 0)
  const currency = currencies[0] ?? trip.currency

  return JSON.stringify({
    status:     'READY',
    reviewUrl,
    tripTotal:  Math.round(total * 100) / 100,
    currency,
    itemCount:  revalResult.eligibleCount,
    message: `Your trip is ready for checkout. All ${revalResult.eligibleCount} item${revalResult.eligibleCount !== 1 ? 's' : ''} confirmed at current prices. Total: ${currency} ${(Math.round(total * 100) / 100).toLocaleString()}. Here's your secure review link — the customer clicks it to review and pay.`,
  })
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildBlockedMessage(soldOut: number, expired: number, stale: number): string {
  const parts: string[] = []
  if (soldOut)  parts.push(`${soldOut} item${soldOut > 1 ? 's are' : ' is'} no longer available`)
  if (expired)  parts.push(`${expired} flight offer${expired > 1 ? 's have' : ' has'} expired`)
  if (stale)    parts.push(`${stale} item${stale > 1 ? 's need' : ' needs'} fresh availability (dates or travellers changed)`)
  return `Unable to proceed to checkout: ${parts.join('; ')}. Please resolve these before continuing.`
}

function buildActionRequiredMessage(
  changed: Array<{ title: string; previousPrice?: number; latestPrice?: number; currency?: string }>,
  failed:  Array<{ title: string }>,
): string {
  const parts: string[] = []
  if (changed.length > 0) {
    const details = changed.map(c =>
      `${c.title}: ${c.currency} ${c.previousPrice?.toFixed(2)} → ${c.currency} ${c.latestPrice?.toFixed(2)}`
    ).join('; ')
    parts.push(`Prices changed — ${details}`)
  }
  if (failed.length > 0) {
    parts.push(`Could not verify latest price for: ${failed.map(f => f.title).join(', ')}`)
  }
  return `${parts.join('. ')}. Please review the updated prices before continuing to payment.`
}
