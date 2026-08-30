import type { NormalizedActivity } from '../../types'
import type { ViatorProductSummary } from './types'

// Pick the best URL from a single Viator image object.
// NOTE: imageSource is often the literal string "SUPPLIER_PROVIDED", not a URL.
// Always prefer variant URLs; never fall back to imageSource.
function bestVariantUrl(img: NonNullable<ViatorProductSummary['images']>[number], minWidth = 0): string | undefined {
  const variants = img.variants?.filter(v => v.url?.startsWith('https')) ?? []
  if (!variants.length) return undefined
  // Sort descending by width, pick first that meets the minWidth threshold
  const sorted = [...variants].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return (sorted.find(v => (v.width ?? 0) >= minWidth) ?? sorted[0])?.url
}

// Returns [heroUrl, thumbUrl] — hero prefers ≥800px, thumb prefers ≥400px.
function pickViatorImages(images?: ViatorProductSummary['images']): { hero?: string; thumb?: string; all: string[] } {
  if (!images?.length) return { all: [] }

  const cover  = images.find(img => img.isCover) ?? images[0]
  const others = images.filter(img => img !== cover)

  const hero  = bestVariantUrl(cover, 800)
    ?? bestVariantUrl(cover, 400)
    ?? bestVariantUrl(cover)
    ?? others.map(img => bestVariantUrl(img, 400)).find(Boolean)

  const thumb = bestVariantUrl(cover, 400)
    ?? bestVariantUrl(cover)

  const all = [cover, ...others]
    .map(img => bestVariantUrl(img, 400) ?? bestVariantUrl(img))
    .filter((u): u is string => !!u)

  if (process.env.NODE_ENV !== 'production' && images.length > 0 && !hero) {
    console.warn('[Viator] No usable image URL found', {
      supplier: 'VIATOR',
      imageCount: images.length,
      mappedImageCount: 0,
      reason: 'All variant URLs missing or non-HTTPS',
    })
  }

  return { hero, thumb, all }
}

// Viator detail API returns inclusions/exclusions as objects, not strings.
// Extract the human-readable text from whichever field is populated.
function extractViatorInclusionText(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() || null
  if (typeof item === 'object' && item !== null) {
    const o = item as Record<string, unknown>
    const text = (o.otherDescription ?? o.description ?? o.typeDescription ?? o.categoryDescription ?? '') as string
    return text.trim() || null
  }
  return null
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
  // Search API: pricing.summary.fromPrice (nested — NOT pricing.fromPrice)
  // Detail API: pricingInfo has no prices, only age-band definitions
  const pricingCurrency = product.pricing?.currency ?? currency
  // fromPrice from the Viator search API is the customer-facing retail price (RRP).
  // partnerNetPrice is only available via the schedule/availability endpoint, not search.
  // Do NOT apply markup on top of RRP — that would price 18% above Viator's own rates.
  const fromPrice    = product.pricing?.summary?.fromPrice ?? 0
  const sellingPrice = Math.round(fromPrice * 100) / 100

  const rating = product.reviews?.combinedAverageRating
  const reviewCount = product.reviews?.totalReviews

  const { hero: imageUrl, all: allImageUrls } = pickViatorImages(product.images)

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

    images: allImageUrls.length
      ? allImageUrls.map((url, i) => ({ url, isCover: i === 0 }))
      : imageUrl ? [{ url: imageUrl, isCover: true }] : [],

    rating,
    reviewCount,

    duration: {
      text:       viatorDurationText(dur),
      minMinutes: durMins,
      maxMinutes: dur?.variableDurationToMinutes ?? durMins,
    },

    highlights:  product.highlights,
    included:    (product.inclusions ?? []).map(extractViatorInclusionText).filter((s): s is string => !!s),
    excluded:    (product.exclusions ?? []).map(extractViatorInclusionText).filter((s): s is string => !!s),
    meetingPoint,

    cancellationPolicy: product.cancellationPolicy?.description,
    freeCancellation,

    instantConfirmation: product.bookingProcess === 'INSTANT',

    currency:         pricingCurrency,
    sellingPrice,
    originalPrice:    product.pricing?.summary?.fromPriceBeforeDiscount ?? undefined,
    supplierNetPrice: undefined, // not available from search endpoint; use schedule API for net price

    source: 'viator',
  }
}
