import { NextResponse } from 'next/server'
import { isAxaConfigured } from '@/lib/axa'

export const dynamic = 'force-dynamic'

// ── In-memory cache (24 h) ────────────────────────────────────────────────────
let cache: { data: unknown; expires: number } | null = null

function bfHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.BATTLEFACE_BEARER_TOKEN}`,
  }
}

/**
 * GET /api/insurance/products
 * Public — no auth required.
 *
 * AXA Partners: products are embedded in the quote response — no separate
 * products endpoint. Returns a lightweight availability signal so the
 * insurance page knows the feature is live.
 *
 * Battleface: fetches product list and caches for 24 h.
 */
export async function GET() {
  // AXA configured — signal availability without a separate products call
  if (isAxaConfigured()) {
    return NextResponse.json({ provider: 'axa', available: true, products: [] })
  }

  // Battleface path
  if (cache && cache.expires > Date.now()) {
    return NextResponse.json(cache.data)
  }

  const baseUrl = process.env.BATTLEFACE_API_URL
  if (!baseUrl || !process.env.BATTLEFACE_BEARER_TOKEN) {
    return NextResponse.json({ error: 'Insurance API not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${baseUrl}/products`, {
      headers: bfHeaders(),
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error('[GET /api/insurance/products]', res.status, txt)
      return NextResponse.json({ error: 'Could not load products' }, { status: 502 })
    }

    const data = await res.json()
    cache = { data, expires: Date.now() + 24 * 60 * 60 * 1000 }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
