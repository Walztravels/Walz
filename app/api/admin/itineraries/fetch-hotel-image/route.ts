import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

const HOTEL_FALLBACKS = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=90&fit=crop',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=90&fit=crop',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=90&fit=crop',
  'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200&q=90&fit=crop',
]

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { url } = await req.json()

  if (url) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WalzBot/1.0; +https://walztravels.com)' },
      })
      clearTimeout(timer)
      const html = await res.text()
      const ogMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
      if (ogMatch?.[1]) {
        let imgUrl = ogMatch[1]
        if (imgUrl.startsWith('/')) {
          const parsed = new URL(url)
          imgUrl = `${parsed.protocol}//${parsed.host}${imgUrl}`
        }
        return NextResponse.json({ url: imgUrl })
      }
    } catch {
      // Fall through to fallback
    }
  }

  return NextResponse.json({
    url: HOTEL_FALLBACKS[Math.floor(Math.random() * HOTEL_FALLBACKS.length)],
    isFallback: true,
  })
}
