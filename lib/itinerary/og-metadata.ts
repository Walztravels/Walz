import type { Metadata } from 'next'

/**
 * Social-preview (Open Graph / Twitter) metadata for public client itineraries.
 *
 * Deliberate rule (supersedes the old "always generic" rule): the preview may
 * show the traveller name, destination and travel dates — and NOTHING else.
 * Never the internal `title`, notes, prices, supplier data, ids or staff fields.
 * The page stays noindex/nofollow/noarchive/nosnippet.
 */

export const SITE_ORIGIN = 'https://www.walztravels.com'
export const ITINERARY_PUBLIC_STATUSES = ['proposal', 'approved', 'revision_sent', 'revision_accepted', 'live'] as const

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
export const MAX_TITLE_LENGTH = 70
export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_IMAGE_URL_LENGTH = 2048

export const ITINERARY_ROBOTS = { index: false, follow: false, noarchive: true, nosnippet: true } as const

/** Metadata for missing / non-public / errored refs. Same as the previous static object. */
export const GENERIC_ITINERARY_METADATA: Metadata = {
  title: { absolute: 'Your Travel Itinerary | Walz Travels' },
  description: 'Review your customized travel itinerary from Walz Travels.',
  robots: { ...ITINERARY_ROBOTS },
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Hosts we trust enough to upgrade http -> https. */
const UPGRADABLE_HOSTS = [
  'images.unsplash.com', 'plus.unsplash.com', 'walztravels.com', 'www.walztravels.com', 'cdn.walztravels.com',
  'bxacijnrgqgmyqyfgumg.supabase.co',
]

export function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  let s = input
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > max) s = s.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
  return s
}

function toValidDate(d: Date | string | null | undefined): Date | null {
  if (d == null || d === '') return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date
}

/** '1–7 December 2026' | '28 November – 4 December 2026' | '28 December 2026 – 3 January 2027'. UTC. */
export function formatDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  const s = toValidDate(start)
  const e = toValidDate(end)
  if (!s && !e) return ''
  const a = (s ?? e) as Date
  const b = (e ?? s) as Date
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a]
  const d1 = from.getUTCDate(), m1 = from.getUTCMonth(), y1 = from.getUTCFullYear()
  const d2 = to.getUTCDate(), m2 = to.getUTCMonth(), y2 = to.getUTCFullYear()
  if (y1 === y2 && m1 === m2 && d1 === d2) return `${d1} ${MONTHS[m1]} ${y1}`
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m1]} ${y1}`
  if (y1 === y2) return `${d1} ${MONTHS[m1]} – ${d2} ${MONTHS[m2]} ${y2}`
  return `${d1} ${MONTHS[m1]} ${y1} – ${d2} ${MONTHS[m2]} ${y2}`
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h.includes(':') || h.startsWith('[')) return true // IPv6 literals
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) return true // any raw IPv4 literal is rejected
  if (!h.includes('.')) return true
  return false
}

export type OgImage = { url: string; width?: number; height?: number }

/** Returns a safe absolute-https image, or null when the value is unusable. */
export function normalizeOgImageUrl(input: unknown): OgImage | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > MAX_IMAGE_URL_LENGTH) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return null

  let candidate = raw
  if (candidate.startsWith('//')) return null
  if (candidate.startsWith('/')) candidate = SITE_ORIGIN + candidate
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null

  let url: URL
  try { url = new URL(candidate) } catch { return null }

  if (url.protocol === 'http:') {
    if (!UPGRADABLE_HOSTS.includes(url.hostname.toLowerCase())) return null
    url.protocol = 'https:'
    if (url.port === '80') url.port = ''
  } else if (url.protocol !== 'https:') {
    return null
  }
  if (url.username || url.password) return null
  if (isPrivateHost(url.hostname)) return null

  if (url.hostname.toLowerCase() === 'images.unsplash.com') {
    url.searchParams.set('w', String(OG_IMAGE_WIDTH))
    url.searchParams.set('h', String(OG_IMAGE_HEIGHT))
    url.searchParams.set('fit', 'crop')
    url.searchParams.set('q', '75')
    return { url: url.toString(), width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
  }
  // Already OUR optimizer URL (www host only): never double-wrap.
  if (url.hostname.toLowerCase() === 'www.walztravels.com' && (url.pathname === '/_next/image' || url.pathname.startsWith('/_next/image/'))) return { url: url.toString() }
  // Large uploads (up to 8 MB) would make WhatsApp drop the preview image, so
  // route allowlisted hosts through the Next optimizer (resized, 1200 wide).
  // Aspect ratio is preserved, so no width/height is declared.
  if (isOptimizableImageHost(url)) {
    return { url: `${SITE_ORIGIN}/_next/image?url=${encodeURIComponent(url.toString())}&w=1200&q=75` }
  }
  // Off-allowlist host: the optimizer would 400, so use as-is.
  return { url: url.toString() }
}

/**
 * Mirrors next.config.mjs images.remotePatterns (all https). Kept in sync by a
 * parity test that parses next.config.mjs. '**.' prefix = any subdomain.
 */
export const OPTIMIZABLE_IMAGE_PATTERNS: ReadonlyArray<{ hostname: string; pathPrefix?: string }> = [
  { hostname: 'images.unsplash.com' },
  { hostname: 'plus.unsplash.com' },
  { hostname: 'lh3.googleusercontent.com' },
  { hostname: 'www.walztravels.com' },
  { hostname: 'walztravels.com' },
  { hostname: 'cdn.walztravels.com' },
  { hostname: 'us.chat-img.sintra.ai' },
  { hostname: 'bxacijnrgqgmyqyfgumg.supabase.co', pathPrefix: '/storage/' },
  { hostname: 'source.unsplash.com' },
  { hostname: 'pics.avs.io' },
  { hostname: 'photos.hotelbeds.com' },
  { hostname: '**.hotelbeds.com' },
  { hostname: 'cdn.hotelbeds.com' },
  { hostname: '**.giata.com' },
  { hostname: '**.activitiesbank.com' },
  { hostname: 'htx.hotelbeds.com' },
  { hostname: 'media-cdn.tripadvisor.com' },
  { hostname: 'media.tacdn.com' },
  { hostname: '**.tacdn.com' },
]

export function isOptimizableImageHost(input: URL | string): boolean {
  let u: URL
  try { u = input instanceof URL ? input : new URL(input) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return OPTIMIZABLE_IMAGE_PATTERNS.some(p => {
    const hostOk = p.hostname.startsWith('**.')
      ? host.endsWith(p.hostname.slice(2)) && host.length > p.hostname.length - 2
      : host === p.hostname
    return hostOk && (!p.pathPrefix || u.pathname.startsWith(p.pathPrefix))
  })
}

export function canonicalItineraryUrl(referenceNumber: string): string {
  return `${SITE_ORIGIN}/itinerary/${encodeURIComponent(referenceNumber)}`
}

export function fallbackOgImageUrl(referenceNumber: string): string {
  return `${SITE_ORIGIN}/og/itinerary/${encodeURIComponent(referenceNumber)}`
}

export type ItineraryPreviewInput = {
  referenceNumber: string
  destination?: string | null
  clientName?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  coverImage?: string | null
}

export function buildItineraryMetadata(input: ItineraryPreviewInput): Metadata {
  const destination = sanitizeText(input.destination, 60)
  const clientName = sanitizeText(input.clientName, 80)
  const range = formatDateRange(input.startDate, input.endDate)

  const title = destination
    ? sanitizeText(`Walz Travels Itinerary | ${destination}`, MAX_TITLE_LENGTH)
    : 'Your Walz Travels Itinerary'

  const lead = [clientName, range].filter(Boolean).join(' · ')
  const description = sanitizeText(
    lead ? `${lead}. Your personalised travel itinerary by Walz Travels.` : 'Your personalised travel itinerary by Walz Travels.',
    MAX_DESCRIPTION_LENGTH,
  )

  const url = canonicalItineraryUrl(input.referenceNumber)
  const cover = normalizeOgImageUrl(input.coverImage)
  const image: OgImage = cover ?? { url: fallbackOgImageUrl(input.referenceNumber), width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }
  const alt = `Walz Travels itinerary — ${destination || 'your trip'}`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { ...ITINERARY_ROBOTS },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Walz Travels',
      locale: 'en_GB',
      title,
      description,
      images: [{ url: image.url, ...(image.width ? { width: image.width, height: image.height } : {}), alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  }
}
