// Hotel TripItem revalidation via Hotelbeds checkrate.
// Reuses the existing hotelbedsRequest client — no second Hotelbeds system.
// SECURITY: never surfaces supplier net rates or raw booking credentials.
import type { Prisma } from '@prisma/client'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { calculateHotelRetailPrice } from '@/lib/pricing/hotel'
import type { RevalidationResult, RevalidationStatus } from '@/lib/trips/revalidate'

interface HotelItemForRevalidation {
  cost:       number | null
  currency:   string
  sourceType: string | null
  sourceId:   string | null   // rateKey stored at save time
  metadata:   Prisma.JsonValue
}

function asRecord(v: Prisma.JsonValue): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

export async function revalidateHotelTripItem(
  item: HotelItemForRevalidation
): Promise<RevalidationResult> {
  const st = item.sourceType?.toLowerCase()
  if (st !== 'hotelbeds') {
    return { status: 'NOT_APPLICABLE', currency: item.currency }
  }

  const meta    = asRecord(item.metadata)
  const rateKey = (meta.rateKey as string | undefined) || item.sourceId
  if (!rateKey) {
    return {
      status:   'REVALIDATION_FAILED',
      currency: item.currency,
      reason:   'No rateKey stored — hotel was saved before room selection',
    }
  }

  try {
    const data = await hotelbedsRequest('hotel', '/checkrates', {
      method: 'POST',
      body:   { rooms: [{ rateKey }] },
    })

    const rooms: unknown[] = data?.hotel?.rooms ?? []
    if (rooms.length === 0) {
      return {
        status:        'SOLD_OUT',
        previousPrice: item.cost ?? undefined,
        currency:      item.currency,
        reason:        'Rate no longer available',
      }
    }

    // Hotelbeds checkrate returns rooms[].rates[].net (net rate).
    // We compare against the stored cost (which is the selling price we computed).
    // Use the first room/rate as the checked rate.
    const firstRoom = rooms[0] as Record<string, unknown>
    const rates     = (firstRoom?.rates as unknown[] | undefined) ?? []
    if (rates.length === 0) {
      return {
        status:        'SOLD_OUT',
        previousPrice: item.cost ?? undefined,
        currency:      item.currency,
        reason:        'No rates returned from checkrate',
      }
    }

    const rate    = rates[0] as Record<string, unknown>
    // Apply the same shared pricing engine used at search time so the comparison
    // is always: old retailTotal vs new retailTotal (never net vs sellingRate).
    const rawNet = typeof rate.net === 'number'
      ? rate.net
      : parseFloat((rate.net as string | undefined) ?? '')
    const nights = typeof meta.nights === 'number' ? meta.nights : 1

    const latestPricing = calculateHotelRetailPrice({
      supplierNetAmount: rawNet,
      currency:          item.currency,
      nights,
    })
    if (!latestPricing) {
      return {
        status:   'REVALIDATION_FAILED',
        currency: item.currency,
        reason:   'Checkrate returned an invalid price',
      }
    }

    const latestPrice   = latestPricing.retailTotal
    const previousPrice = item.cost ?? 0
    const delta         = Math.abs(latestPrice - previousPrice)

    // Treat price changes >0.01 as significant
    if (delta > 0.01) {
      return {
        status: 'PRICE_CHANGED',
        previousPrice,
        latestPrice,
        currency: item.currency,
      }
    }

    return {
      status:        'UNCHANGED',
      previousPrice,
      latestPrice,
      currency:      item.currency,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[revalidateHotelTripItem]', msg)
    return {
      status:        'REVALIDATION_FAILED',
      previousPrice: item.cost ?? undefined,
      currency:      item.currency,
      reason:        'Hotelbeds checkrate failed',
    }
  }
}
