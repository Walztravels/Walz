// Server-side trip item revalidation.
// Reuses calculateViatorSellingPrice from the shared viator-schedule module.
// SECURITY: never surfaces partnerNetPrice or supplier cost.
import type { Prisma } from '@prisma/client'
import { calculateViatorSellingPrice } from '@/lib/activities/viator-schedule'

export type RevalidationStatus =
  | 'UNCHANGED'
  | 'PRICE_CHANGED'
  | 'SOLD_OUT'
  | 'REVALIDATION_FAILED'
  | 'NOT_APPLICABLE'

export interface RevalidationResult {
  status:        RevalidationStatus
  previousPrice?: number
  latestPrice?:  number
  currency:      string
  reason?:       string
}

interface TripItemForRevalidation {
  cost:       number | null
  currency:   string
  sourceType: string | null
  sourceId:   string | null
  metadata:   Prisma.JsonValue
}

function asRecord(v: Prisma.JsonValue): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

export async function revalidateTripActivityItem(
  item: TripItemForRevalidation
): Promise<RevalidationResult> {
  if (item.sourceType?.toLowerCase() !== 'viator' || !item.sourceId) {
    return { status: 'NOT_APPLICABLE', currency: item.currency }
  }

  const meta       = asRecord(item.metadata)
  const travelDate = meta.travelDate as string | undefined
  if (!travelDate) {
    return { status: 'NOT_APPLICABLE', currency: item.currency, reason: 'No travel date stored' }
  }

  try {
    const result = await calculateViatorSellingPrice({
      productCode: item.sourceId,
      date:        travelDate,
      adults:      Number(meta.adults  ?? 1),
      children:    Number(meta.children ?? 0),
      infants:     Number(meta.infants  ?? 0),
      currency:    item.currency || 'GBP',
    })

    if (!result.available) {
      return {
        status:        'SOLD_OUT',
        previousPrice: item.cost ?? undefined,
        currency:      result.currency,
        reason:        result.reason,
      }
    }

    const latestPrice   = result.totalSellingPrice!
    const previousPrice = item.cost ?? 0

    if (Math.abs(latestPrice - previousPrice) > 0.01) {
      return { status: 'PRICE_CHANGED', previousPrice, latestPrice, currency: result.currency }
    }

    return { status: 'UNCHANGED', previousPrice, latestPrice, currency: result.currency }
  } catch (err) {
    console.error('[revalidateTripActivityItem]', err instanceof Error ? err.message : err)
    return { status: 'REVALIDATION_FAILED', previousPrice: item.cost ?? undefined, currency: item.currency }
  }
}
