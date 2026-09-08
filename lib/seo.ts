/**
 * Shared SEO/metadata helpers.
 *
 * Route metadata classes (used across app/):
 *  - Public marketing page  → unique title/description/canonical/social
 *  - Public dynamic detail  → generateMetadata from the DB record
 *  - Transaction/form page  → purpose title, robots { index: false, follow: true }
 *  - Private/token page     → generic title, strict robots (no index/follow/archive/snippet)
 *  - Admin/internal         → noindex, nofollow
 *
 * The root layout supplies the brand title template ('%s | Walz Travels'),
 * so titles built here must NOT append the brand themselves.
 */

import type { Metadata } from 'next'

/** Production origin. Never a localhost or preview URL: the env override is
 *  accepted only when it points at a walztravels.com origin. */
const RAW_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.walztravels.com'
export const SITE_URL = /^https:\/\/(www\.)?walztravels\.com$/.test(RAW_BASE)
  ? RAW_BASE
  : 'https://www.walztravels.com'

export const SITE_NAME = 'Walz Travels'

/** Existing brand social share image (root layout uses the same asset). */
export const DEFAULT_OG_IMAGE =
  'https://us.chat-img.sintra.ai/aeb90658-6cce-491a-8a0f-bfc14a8cdc69/e2fd6df1-f938-441d-a8d8-37a20caa465b/walz-travels-og-share-image.png'

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Safe description truncation at a word boundary (~120–160 chars target). */
export function truncateDescription(text: string, max = 158): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max)}…`
}

/** Strict non-indexable robots for private/token-gated/personal pages. */
export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
} as const

/**
 * Private or token-gated page: generic purpose title, no personal data,
 * never indexed, archived, or snippeted. `title` must not contain names,
 * references, or tokens.
 */
export function privateMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description: description ?? 'This page is personal to its recipient and is not publicly listed.',
    robots: PRIVATE_ROBOTS,
  }
}

/**
 * Transaction/application form page: purpose-specific title, not indexed
 * (forms must not compete with their marketing/detail pages), but crawlable
 * links are followed. Pass `canonical` to consolidate signals on the page
 * the form belongs to (e.g. the job or product detail page).
 */
export function transactionalMetadata(title: string, description: string, canonical?: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: true },
    ...(canonical ? { alternates: { canonical } } : {}),
  }
}

/** Social preview block for indexable marketing/detail pages. */
export function socialPreview(title: string, description: string, url: string, image = DEFAULT_OG_IMAGE) {
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website' as const,
      images: [{ url: image, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [image],
    },
  }
}
