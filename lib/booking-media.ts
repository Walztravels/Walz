/**
 * Shared booking media resolution for Walz Travels.
 *
 * Pure module — no HTTP calls, no React imports.
 * Resolves cover images and logos for all booking types.
 */

import { getAirlineLogoUrl } from './airline-logos'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingType = 'flight' | 'hotel' | 'transfer' | 'tour' | 'train' | 'ferry'

export type BookingMediaResult = {
  primaryImageUrl: string | null  // the best cover image URL
  logoUrl: string | null          // airline/operator logo where applicable
  fallbackType: BookingType       // for icon fallback rendering
  hasRealImage: boolean           // true when primaryImageUrl comes from a real upload/scrape (not just a CDN logo)
}

// ---------------------------------------------------------------------------
// resolveBookingMedia
// ---------------------------------------------------------------------------

/**
 * Resolve the best cover image and logo for any booking type.
 *
 * @param type    - The kind of booking item.
 * @param booking - Raw booking record (typed loosely; callers own the shape).
 * @returns       BookingMediaResult with primaryImageUrl, logoUrl, fallbackType, hasRealImage.
 */
export function resolveBookingMedia(
  type: BookingType,
  booking: Record<string, unknown>,
): BookingMediaResult {
  switch (type) {
    case 'flight': {
      const logoUrl = getAirlineLogoUrl(
        booking.iataCode as string | null,
        booking.airlineLogoUrl as string | null,
      )
      const primaryImageUrl = (booking.imageUrl as string | null) || null
      const hasRealImage = !!(booking.imageUrl)
      return { primaryImageUrl, logoUrl, fallbackType: type, hasRealImage }
    }

    case 'hotel': {
      const imgs =
        (booking.images as string[] | undefined) ??
        (booking.image ? [booking.image as string] : [])
      const primaryImageUrl = imgs[0] || null
      const hasRealImage = !!primaryImageUrl
      return { primaryImageUrl, logoUrl: null, fallbackType: type, hasRealImage }
    }

    case 'transfer': {
      const imgs =
        (booking.images as string[] | undefined) ??
        (booking.image ? [booking.image as string] : [])
      const primaryImageUrl = imgs[0] || null
      const hasRealImage = !!primaryImageUrl
      return { primaryImageUrl, logoUrl: null, fallbackType: type, hasRealImage }
    }

    case 'tour': {
      const imgs =
        (booking.images as string[] | undefined) ??
        (booking.image ? [booking.image as string] : [])
      const primaryImageUrl = imgs[0] || null
      const hasRealImage = !!primaryImageUrl
      return { primaryImageUrl, logoUrl: null, fallbackType: type, hasRealImage }
    }

    case 'train': {
      const imgs =
        (booking.images as string[] | undefined) ??
        (booking.image ? [booking.image as string] : [])
      const primaryImageUrl = imgs[0] || null
      const hasRealImage = !!primaryImageUrl
      return { primaryImageUrl, logoUrl: null, fallbackType: type, hasRealImage }
    }

    case 'ferry': {
      const imgs =
        (booking.images as string[] | undefined) ??
        (booking.image ? [booking.image as string] : [])
      const primaryImageUrl = imgs[0] || null
      const hasRealImage = !!primaryImageUrl
      return { primaryImageUrl, logoUrl: null, fallbackType: type, hasRealImage }
    }
  }
}
