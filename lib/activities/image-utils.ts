// Centralized activity image helpers shared across search cards, detail pages, and admin.

import type { NormalizedActivity } from './types'

const FALLBACK = '/images/activities-placeholder.jpg'

/** Validate that a URL is a usable HTTPS image URL. */
export function isValidImageUrl(url: unknown): url is string {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('/')) return true            // local asset — always ok
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Return the best image URL for an activity, with a graceful fallback chain:
 *   1. activity.images[0].url (cover image from supplier)
 *   2. activity.images[1..].url (any other gallery image)
 *   3. fallback placeholder
 *
 * Never passes an invalid/non-HTTPS URL to <Image />.
 */
export function getActivityPrimaryImage(activity: NormalizedActivity | { images?: { url: string }[]; image?: string }): string {
  const images = (activity as NormalizedActivity).images ?? []
  for (const img of images) {
    if (isValidImageUrl(img.url)) return img.url
  }
  // Legacy HB detail-page shape has a flat `image` field
  const legacyImage = (activity as { image?: string }).image
  if (isValidImageUrl(legacyImage)) return legacyImage as string
  return FALLBACK
}

/**
 * Return ALL valid gallery image URLs for an activity (hero + gallery).
 * First element is always the cover/primary image.
 */
export function getActivityGalleryImages(activity: NormalizedActivity): string[] {
  const images = activity.images ?? []
  const urls   = images.map(i => i.url).filter(isValidImageUrl)
  return urls.length ? urls : [FALLBACK]
}
