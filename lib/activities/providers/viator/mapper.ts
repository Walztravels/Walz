import { applyActivityMarkup } from '../../pricing'
import type { NormalizedActivity } from '../../types'
import type { ViatorProductSummary } from './types'

function pickViatorImage(images?: ViatorProductSummary['images']): string | undefined {
  if (!images?.length) return undefined
  const cover = images.find(img => img.isCover) ?? images[0]
  return (
    cover.variants?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
    cover.imageSource
  )
}

function viatorDurationText(d?: ViatorProductSummary['duration']): string | undefined {
  if (!d) return undefined
  if (d.unstructuredDuration) return d.unstructuredDuration
  const mins = d.fixedDurationInMinutes ?? d.variableDurationFromMinutes
  if (!mins) return undefined
  if (mins >= 1440) return `${Math.round(mins / 1440)} day${Math.round(mins / 1440) > 1 ? 's' : ''}`
  if (mins >= 60)   return `${Math.round(mins / 60)} hr${Math.round(mins / 60) > 1 ? 's' : ''}`
  return `${mins} min`
}

function viatorFreeCancellation(policy?: ViatorProductSummary['cancellationPolicy']): boolean {
  if (!policy) return false
  if (policy.type === 'ALL_SALES_FINAL') return false
  // Free cancellation = can get 100% refund with positive day window
  return !!(policy.refundEligibility?.some(r => (r.percentageRefundable ?? 0) >= 100 && (r.dayRangeMin ?? 0) >= 0))
}

/** Map a Viator product summary to Walz's NormalizedActivity shape */
export function mapViatorProduct(
  product: ViatorProductSummary,
  destName: string,
  currency: string = 'GBP',
): NormalizedActivity {
  const pricing = product.pricing ?? product.pricingInfo
  const supplierNetPrice = pricing?.fromPrice ?? 0
  const { sellingPrice } = applyActivityMarkup(supplierNetPrice, 'VIATOR', pricing?.currency ?? currency)

  const rating = product.reviews?.combinedAverageRating
  const reviewCount = product.reviews?.totalReviews

  const imageUrl = pickViatorImage(product.images)

  const dur = product.duration ?? product.itinerary?.duration
  const durMins = dur?.fixedDurationInMinutes
    ?? dur?.variableDurationFromMinutes
    ?? undefined

  const freeCancellation = viatorFreeCancellation(product.cancellationPolicy)
    || !!(product.flags?.includes('FREE_CANCELLATION'))

  const location = product.locations?.[0]
  const meetingPoint = location?.unstructuredLocation

  return {
    id:                `VIATOR-${product.productCode}`,
    supplier:          'VIATOR',
    supplierProductId: product.productCode,
    slug:              `viator-${product.productCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,

    title:            product.title,
    shortDescription: product.shortDescription || undefined,
    description:      product.description || undefined,

    destination: { name: destName },

    location: {
      latitude:  location?.attractionLatitude  ?? undefined,
      longitude: location?.attractionLongitude ?? undefined,
      address:   meetingPoint,
    },

    images: imageUrl ? [{ url: imageUrl, isCover: true }] : [],

    rating,
    reviewCount,

    duration: {
      text:       viatorDurationText(dur),
      minMinutes: durMins,
      maxMinutes: dur?.variableDurationToMinutes ?? durMins,
    },

    highlights:  product.highlights,
    included:    product.inclusions,
    excluded:    product.exclusions,
    meetingPoint,

    cancellationPolicy: product.cancellationPolicy?.description,
    freeCancellation,

    instantConfirmation: product.bookingProcess === 'INSTANT',

    currency:         pricing?.currency ?? currency,
    sellingPrice,
    originalPrice:    pricing?.fromPriceBeforeDiscount ?? undefined,
    supplierNetPrice: supplierNetPrice || undefined,

    source: 'viator',
  }
}
