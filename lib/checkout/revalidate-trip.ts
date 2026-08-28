// lib/checkout/revalidate-trip.ts
// Unified revalidation for all TripItem types before checkout.
// Called by the prepare_trip_checkout tool AND by the /api/checkout/trip route.
//
// SECURITY invariants:
//   - Never returns supplier net prices, rateKeys, or internal markup
//   - Prices in results are authoritative retail prices from the relevant supplier API
//   - STALE / EXPIRED / SOLD_OUT always block checkout — never silently passed through
//   - REVALIDATION_FAILED is ACTION_REQUIRED: customer is told, but can retry

import type { Prisma }               from '@prisma/client'
import { revalidateTripActivityItem } from '@/lib/trips/revalidate'
import { revalidateHotelTripItem }    from '@/lib/trips/revalidate-hotel'

export type ItemValidationStatus =
  | 'READY'              // price current, inventory available
  | 'PRICE_CHANGED'      // price changed — customer must accept before proceeding
  | 'SOLD_OUT'           // inventory gone — customer must replace
  | 'EXPIRED'            // flight offer TTL elapsed — must re-search
  | 'REVALIDATION_FAILED'// supplier API error — can retry
  | 'STALE'              // dates/travellers changed — must re-search
  | 'PURCHASED'          // already purchased — excluded from new checkout
  | 'NOT_APPLICABLE'     // no live revalidation available for this type (transfer, esim)

export interface CheckoutItemValidation {
  itemId:          string
  title:           string
  type:            string
  status:          ItemValidationStatus
  previousPrice?:  number
  latestPrice?:    number
  currency?:       string
  reason?:         string
}

export interface CheckoutValidationResult {
  status: 'READY' | 'ACTION_REQUIRED' | 'BLOCKED'
  items:  CheckoutItemValidation[]
  // Eligible items only — excludes PURCHASED and NOT_APPLICABLE
  eligibleCount:    number
  priceChangedCount: number
  blockedCount:     number
}

// Types that can be placed into a Walz checkout cart
const CART_ELIGIBLE_TYPES = new Set(['ACTIVITY', 'TRANSFER', 'TRANSPORT', 'HOTEL', 'FLIGHT'])

export type DbTripItem = {
  id:         string
  type:       string
  title:      string
  cost:       number | null
  currency:   string
  confirmed:  boolean
  bookingRef: string | null
  sourceType: string | null
  sourceId:   string | null
  metadata:   Prisma.JsonValue
}

export async function revalidateAllTripItems(
  items: DbTripItem[],
): Promise<CheckoutValidationResult> {
  const results: CheckoutItemValidation[] = []

  await Promise.all(items.map(async item => {
    const itemType = item.type.toUpperCase()
    const meta     = (typeof item.metadata === 'object' && item.metadata && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : {}) as Record<string, unknown>

    // Non-cartable types — notes, visas, custom items
    if (!CART_ELIGIBLE_TYPES.has(itemType)) {
      results.push({ itemId: item.id, title: item.title, type: item.type, status: 'NOT_APPLICABLE' })
      return
    }

    // Already purchased — exclude from new checkout silently
    if (item.confirmed || item.bookingRef) {
      results.push({ itemId: item.id, title: item.title, type: item.type, status: 'PURCHASED' })
      return
    }

    // Stale marker — dates or travellers changed, must re-search
    if (meta.staleReason) {
      results.push({
        itemId: item.id, title: item.title, type: item.type,
        status: 'STALE', reason: String(meta.staleReason),
      })
      return
    }

    // ── FLIGHT: check offer TTL ───────────────────────────────────────────────
    if (itemType === 'FLIGHT') {
      const expiresAt = meta.offerExpiresAt as string | undefined
      if (expiresAt && new Date(expiresAt) <= new Date()) {
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: 'EXPIRED', reason: 'Flight offer has expired — please search for current fares.',
        })
      } else {
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: 'READY', currency: item.currency,
          latestPrice: item.cost ?? undefined,
        })
      }
      return
    }

    // ── HOTEL (hotelbeds): live checkrate ─────────────────────────────────────
    if (itemType === 'HOTEL' && item.sourceType?.toLowerCase() === 'hotelbeds') {
      try {
        const r = await revalidateHotelTripItem(item)
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: r.status === 'UNCHANGED' ? 'READY' : (r.status as ItemValidationStatus),
          previousPrice: r.previousPrice,
          latestPrice:   r.latestPrice,
          currency:      r.currency,
        })
      } catch {
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: 'REVALIDATION_FAILED',
          reason: 'Could not reach hotel rate service — please try again.',
        })
      }
      return
    }

    // ── ACTIVITY (viator): live pricing ──────────────────────────────────────
    if (itemType === 'ACTIVITY' && item.sourceType?.toLowerCase() === 'viator') {
      try {
        const r = await revalidateTripActivityItem(item)
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: r.status === 'UNCHANGED' ? 'READY' : (r.status as ItemValidationStatus),
          previousPrice: r.previousPrice,
          latestPrice:   r.latestPrice,
          currency:      r.currency,
        })
      } catch {
        results.push({
          itemId: item.id, title: item.title, type: item.type,
          status: 'REVALIDATION_FAILED',
          reason: 'Could not reach activity availability service — please try again.',
        })
      }
      return
    }

    // ── TRANSFER, TRANSPORT, non-viator ACTIVITY, non-hotelbeds HOTEL ────────
    // No live supplier revalidation available — trust DB price.
    // Document as a known limitation: transfers should be manually repriced by staff.
    results.push({
      itemId: item.id, title: item.title, type: item.type,
      status: 'READY', currency: item.currency,
      latestPrice: item.cost ?? undefined,
    })
  }))

  // Aggregate status
  const eligible   = results.filter(r => r.status !== 'NOT_APPLICABLE' && r.status !== 'PURCHASED')
  const blocked    = eligible.filter(r => ['SOLD_OUT', 'EXPIRED', 'STALE'].includes(r.status))
  const changed    = eligible.filter(r => r.status === 'PRICE_CHANGED')
  const failed     = eligible.filter(r => r.status === 'REVALIDATION_FAILED')

  const overallStatus: CheckoutValidationResult['status'] =
    blocked.length > 0          ? 'BLOCKED' :
    changed.length > 0 || failed.length > 0 ? 'ACTION_REQUIRED' :
                                  'READY'

  return {
    status:            overallStatus,
    items:             results,
    eligibleCount:     eligible.length,
    priceChangedCount: changed.length,
    blockedCount:      blocked.length,
  }
}
