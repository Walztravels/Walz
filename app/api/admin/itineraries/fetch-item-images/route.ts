// app/api/admin/itineraries/fetch-item-images/route.ts
// Fetches multiple images for an itinerary booking item.
//
// itemType: 'hotel' → scrapes the hotel website for all image metadata
// itemType: 'destination' → returns Unsplash destination photos by name
// itemType: 'activity' | 'transfer' → destination-based Unsplash photos
//
// Returns: { urls: string[]; source: 'scraped' | 'unsplash' | 'fallback' }

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

const MAX_IMAGES = 8

// Curated Unsplash query map for known destinations
const DESTINATION_QUERIES: Record<string, string> = {
  dubai:        'dubai-skyline-city',
  london:       'london-city-landmark',
  paris:        'paris-eiffel-tower',
  maldives:     'maldives-beach-resort',
  bali:         'bali-temple-rice-terrace',
  tokyo:        'tokyo-japan-city',
  'new york':   'new-york-city-skyline',
  santorini:    'santorini-greece-white',
  rome:         'rome-italy-colosseum',
  barcelona:    'barcelona-spain-gaudi',
  toronto:      'toronto-canada-city',
  cancun:       'cancun-mexico-beach',
  istanbul:     'istanbul-turkey-mosque',
  singapore:    'singapore-city-marina',
  miami:        'miami-beach-florida',
  amsterdam:    'amsterdam-canal-city',
  cairo:        'cairo-egypt-pyramids',
  capetown:     'cape-town-table-mountain',
  'cape town':  'cape-town-table-mountain',
  lagos:        'lagos-nigeria-city',
  accra:        'accra-ghana-city',
  nairobi:      'nairobi-kenya-africa',
  zanzibar:     'zanzibar-beach-turquoise',
}

const HOTEL_FALLBACKS = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80',
  'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200&q=80',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80',
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80',
]

const ACTIVITY_FALLBACKS = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=1200&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80',
  'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=1200&q=80',
  'https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=1200&q=80',
]

// Scrape a URL for every image reference we can find
async function scrapeImages(url: string): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WalzBot/1.0; +https://walztravels.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timer)
    const html = await res.text()
    const base = new URL(url)
    const found = new Set<string>()

    const toAbsolute = (src: string) => {
      if (!src || src.startsWith('data:')) return null
      try {
        if (src.startsWith('//')) return `${base.protocol}${src}`
        if (src.startsWith('/'))  return `${base.protocol}//${base.host}${src}`
        if (src.startsWith('http')) return src
        return null
      } catch { return null }
    }

    // 1. All og:image meta tags (sites may have multiple)
    const ogRe = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi
    let m: RegExpExecArray | null
    while ((m = ogRe.exec(html)) !== null) {
      const abs = toAbsolute(m[1])
      if (abs) found.add(abs)
    }
    // Reversed attribute order
    const ogRe2 = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/gi
    while ((m = ogRe2.exec(html)) !== null) {
      const abs = toAbsolute(m[1])
      if (abs) found.add(abs)
    }

    // 2. Twitter card image
    const twRe = /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/gi
    while ((m = twRe.exec(html)) !== null) {
      const abs = toAbsolute(m[1])
      if (abs) found.add(abs)
    }

    // 3. JSON-LD image fields
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    while ((m = ldRe.exec(html)) !== null) {
      try {
        const ld = JSON.parse(m[1]) as Record<string, unknown>
        const imgs: string[] = []
        const extract = (v: unknown) => {
          if (typeof v === 'string' && /\.(jpe?g|png|webp|avif)/i.test(v)) imgs.push(v)
          else if (Array.isArray(v)) v.forEach(extract)
          else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(extract)
        }
        const imageVal = (ld.image ?? ld.photo ?? ld.thumbnail ?? (ld['@graph'] && (ld['@graph'] as Record<string, unknown>[])?.[0]?.image))
        extract(imageVal)
        imgs.forEach(src => { const abs = toAbsolute(src); if (abs) found.add(abs) })
      } catch { /* ignore bad JSON-LD */ }
    }

    // 4. Large inline img tags (src that look like hero/gallery images, ≥400px hint in URL or on high-quality paths)
    const imgRe = /<img[^>]*src=["']([^"']+)["'][^>]*(?:width=["'](\d+)["']|height=["'](\d+)["'])?/gi
    while ((m = imgRe.exec(html)) !== null && found.size < MAX_IMAGES) {
      const src = m[1]
      const w = parseInt(m[2] ?? '0')
      const h = parseInt(m[3] ?? '0')
      if ((w >= 400 || h >= 400 || /photo|gallery|hero|banner|room|suite|exterior|pool|lobby/i.test(src))) {
        const abs = toAbsolute(src)
        if (abs && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(abs)) found.add(abs)
      }
    }

    return [...found].slice(0, MAX_IMAGES)
  } catch {
    clearTimeout(timer)
    return []
  }
}

// Fetch destination photos using a stable hash into our curated fallback lists.
// No external API call needed — source.unsplash.com is deprecated and unreliable.
function getUnsplashDestinationPhotos(destination: string, isHotel = false): string[] {
  const pool = isHotel ? HOTEL_FALLBACKS : ACTIVITY_FALLBACKS
  // Simple deterministic hash so the same destination always gets the same photos
  const hash = destination.toLowerCase().split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const offset = hash % pool.length
  // Return 4 photos, wrapping around the pool
  return Array.from({ length: 4 }, (_, i) => pool[(offset + i) % pool.length])
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { itemType, url, destination } = await req.json() as {
    itemType:    'hotel' | 'activity' | 'transfer' | 'tour' | 'destination'
    url?:        string   // hotel/activity website URL to scrape
    destination?: string  // destination name for fallback/unsplash
  }

  // Hotels: try to scrape the website first
  if ((itemType === 'hotel' || itemType === 'activity' || itemType === 'tour' || itemType === 'transfer') && url) {
    const scraped = await scrapeImages(url)
    if (scraped.length > 0) {
      return NextResponse.json({ urls: scraped, source: 'scraped' })
    }
  }

  // Destination-based photos (hotels, activities, transfers)
  if (destination) {
    const photos = getUnsplashDestinationPhotos(destination, itemType === 'hotel')
    return NextResponse.json({ urls: photos, source: 'fallback' })
  }

  // Generic fallbacks
  const fallbacks = itemType === 'hotel' ? HOTEL_FALLBACKS : ACTIVITY_FALLBACKS
  return NextResponse.json({ urls: fallbacks.slice(0, 4), source: 'fallback' })
}
