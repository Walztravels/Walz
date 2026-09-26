/**
 * Single source of truth for the Walz Travels visa social-share graphic.
 *
 * The artwork keeps its native 1168x784 proportions (1.49:1) so no text is
 * cropped; dimensions declared here match the file byte-for-byte.
 *
 * Next.js metadata rule relied on: a route's `openGraph` / `twitter` object
 * REPLACES the parent's (shallow merge per top-level key). So every visa page
 * or layout that defines its own openGraph/twitter must spread
 * `visaSocialMetadata(...)`; routes that define neither inherit the visa layout.
 */
import type { Metadata } from 'next'
import { privateMetadata, SITE_NAME } from '@/lib/seo'

export const VISA_SOCIAL_IMAGE = 'https://www.walztravels.com/images/social/walz-visa-assistance-og.jpg'
export const VISA_SOCIAL_IMAGE_WIDTH = 1168
export const VISA_SOCIAL_IMAGE_HEIGHT = 784
export const VISA_SOCIAL_IMAGE_ALT = 'Walz Travels — Visa Assistance. Travel with Confidence.'

export function visaSocialMetadata(opts: { title: string; description: string; url?: string }) {
  const { title, description, url } = opts
  return {
    openGraph: {
      type: 'website' as const,
      title,
      description,
      ...(url ? { url } : {}),
      siteName: SITE_NAME,
      images: [
        {
          url: VISA_SOCIAL_IMAGE,
          width: VISA_SOCIAL_IMAGE_WIDTH,
          height: VISA_SOCIAL_IMAGE_HEIGHT,
          alt: VISA_SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [VISA_SOCIAL_IMAGE],
    },
  }
}

/** Private/token visa page: strict robots, generic title, visa image, no applicant data. */
export function privateMetadataWithVisaSocial(title: string, description: string): Metadata {
  return { ...privateMetadata(title, description), ...visaSocialMetadata({ title, description }) }
}
