// app/api/admin/itineraries/fetch-item-images/route.ts
// Fetches real property images for an itinerary booking item by scraping its website.
// Returns only actual content images — logos, icons, placeholders, and tiny images
// are filtered out.  If scraping yields nothing, noImages is true and images is [].
// No placeholder/fallback URLs are ever returned.
//
// Returns: { images: string[]; noImages: boolean; source: "website" }

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

const MAX_IMAGES = 8

// Reject images whose pathname contains any of these patterns — they are UI
// assets, not property photos.
const REJECT_PATH_RE =
  /logo|favicon|icon|sprite|placeholder|default[\-_.]|blank|loading|spinner|avatar|no[\-_]image|noimage|pixel|tracking|badge|button|arrow|close|menu|checkmark|star|rating|flag|map[\-_]pin|marker|\.gif$/i

// Accept standard dot-extension images AND extensionless CDN transform URLs that
// end with a recognised format suffix (e.g. Cloudinary / Maybourne: "…-jpeg").
// Issue 11: extensionless CDN URLs (confirmed on Claridge's og:image) were
// silently dropped because the original regex required a literal dot.
const IMAGE_EXT_RE = /(\.(jpe?g|png|webp|avif|gif|svg)(\?[^#]*)?($|#)|-(jpe?g|png|webp|avif|gif|svg)(\?[^#]*)?$)/i

// Convert a potentially relative URL to absolute, using `base` as the context.
// Returns null when the src is unusable (data URI, blob, unparsable).
function toAbsolute(src: string, base: URL): string | null {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null
  try {
    if (src.startsWith('//')) return `${base.protocol}${src}`
    if (src.startsWith('/')) return `${base.protocol}//${base.host}${src}`
    if (src.startsWith('http')) return src
    return new URL(src, base.href).href
  } catch {
    return null
  }
}

// Returns false for images that are clearly not property/content photos.
function isAcceptable(url: string): boolean {
  if (!IMAGE_EXT_RE.test(url)) return false
  try {
    const { pathname } = new URL(url)
    if (REJECT_PATH_RE.test(pathname)) return false
  } catch {
    if (REJECT_PATH_RE.test(url)) return false
  }
  return true
}

// Safely read a regex match group from an HTML string, converting the captured
// URL to absolute and checking acceptability.
function collectMatch(
  src: string,
  base: URL,
  bucket: string[],
  seen: Set<string>,
): void {
  const abs = toAbsolute(src.trim(), base)
  if (!abs || !isAcceptable(abs) || seen.has(abs)) return
  seen.add(abs)
  bucket.push(abs)
}

// Walk a JSON-LD value recursively, collecting image URL strings into `out`.
function extractJsonLdImages(v: unknown, base: URL, out: string[], seen: Set<string>): void {
  if (typeof v === 'string') {
    if (IMAGE_EXT_RE.test(v)) collectMatch(v, base, out, seen)
    return
  }
  if (Array.isArray(v)) {
    v.forEach(item => extractJsonLdImages(item, base, out, seen))
    return
  }
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    // Fields that carry image references in schema.org
    for (const key of ['image', 'photo', 'thumbnail', 'primaryImageOfPage', 'associatedMedia', 'contentUrl']) {
      if (obj[key]) extractJsonLdImages(obj[key], base, out, seen)
    }
    // Recurse into @graph arrays
    if (obj['@graph']) extractJsonLdImages(obj['@graph'], base, out, seen)
  }
}

async function scrapeImages(websiteUrl: string): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        // A realistic browser UA reduces 403 bot-blocks.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    })
    clearTimeout(timer)

    if (!res.ok) return []

    const html = await res.text()
    const base = new URL(websiteUrl)
    const seen = new Set<string>()

    // Priority buckets — merged in this order so og:image always ranks first.
    const ogImages: string[] = []
    const schemaImages: string[] = []
    const twitterImages: string[] = []
    const galleryImages: string[] = []

    // ── 1. og:image meta tags ──────────────────────────────────────────────
    // Collect og:image:width values to skip declared-tiny images.
    const ogWidthValues: number[] = []
    const ogWidthRe1 =
      /<meta[^>]*property=["']og:image:width["'][^>]*content=["'](\d+)["']/gi
    const ogWidthRe2 =
      /<meta[^>]*content=["'](\d+)["'][^>]*property=["']og:image:width["']/gi
    let wm: RegExpExecArray | null
    while ((wm = ogWidthRe1.exec(html)) !== null) ogWidthValues.push(parseInt(wm[1]))
    while ((wm = ogWidthRe2.exec(html)) !== null) ogWidthValues.push(parseInt(wm[1]))

    const rawOgImages: string[] = []
    let m: RegExpExecArray | null
    const ogRe1 = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi
    const ogRe2 = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/gi
    while ((m = ogRe1.exec(html)) !== null) rawOgImages.push(m[1])
    while ((m = ogRe2.exec(html)) !== null) rawOgImages.push(m[1])

    rawOgImages.forEach((src, i) => {
      const declaredWidth = ogWidthValues[i] ?? 0
      // Reject only when the site explicitly declares a width below our threshold.
      if (declaredWidth > 0 && declaredWidth < 300) return
      collectMatch(src, base, ogImages, seen)
    })

    // ── 2. Schema.org / JSON-LD ────────────────────────────────────────────
    const ldRe =
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    while ((m = ldRe.exec(html)) !== null) {
      try {
        const ld = JSON.parse(m[1]) as Record<string, unknown>
        extractJsonLdImages(ld, base, schemaImages, seen)
      } catch { /* ignore malformed JSON-LD */ }
    }

    // ── 3. Twitter card image ──────────────────────────────────────────────
    const twRe1 =
      /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/gi
    const twRe2 =
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/gi
    while ((m = twRe1.exec(html)) !== null) collectMatch(m[1], base, twitterImages, seen)
    while ((m = twRe2.exec(html)) !== null) collectMatch(m[1], base, twitterImages, seen)

    // ── 4. Large inline <img> tags ────────────────────────────────────────
    // Include only images that have a declared dimension >= 300px or whose
    // src path contains keywords associated with property/gallery imagery.
    const CONTENT_KEYWORD_RE =
      /photo|gallery|hero|banner|room|suite|exterior|pool|lobby|resort|property|bedroom|bathroom|view|restaurant|spa|facade/i
    const imgTagRe = /<img\b([^>]*)>/gi
    while ((m = imgTagRe.exec(html)) !== null && galleryImages.length < MAX_IMAGES) {
      const attrs = m[1]
      const srcM = /\bsrc=["']([^"']+)["']/.exec(attrs)
      if (!srcM) continue
      const src = srcM[1]
      const w = parseInt((/\bwidth=["']?(\d+)["']?/.exec(attrs) ?? [])[1] ?? '0')
      const h = parseInt((/\bheight=["']?(\d+)["']?/.exec(attrs) ?? [])[1] ?? '0')
      if (w >= 300 || h >= 300 || CONTENT_KEYWORD_RE.test(src)) {
        collectMatch(src, base, galleryImages, seen)
      }
    }

    // ── Merge buckets in priority order ───────────────────────────────────
    const result: string[] = []
    for (const bucket of [ogImages, schemaImages, twitterImages, galleryImages]) {
      for (const u of bucket) {
        if (result.length >= MAX_IMAGES) break
        result.push(u)
      }
    }
    return result
  } catch {
    clearTimeout(timer)
    return []
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    url?:         string   // hotel/activity website URL to scrape
    // Legacy fields kept for call-site compatibility — not used for fallbacks.
    itemType?:    string
    destination?: string
  }

  const { url } = body

  if (!url) {
    return NextResponse.json({ images: [], noImages: true, source: 'website' })
  }

  const images = await scrapeImages(url)
  return NextResponse.json({
    images,
    noImages: images.length === 0,
    source: 'website',
  })
}
