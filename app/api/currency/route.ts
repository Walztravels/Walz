import { NextRequest, NextResponse } from 'next/server'
import { CURRENCY_CODES } from '@/lib/currencies'

export const dynamic = 'force-dynamic'

// ── 1-hour in-memory cache (module-level, survives warm lambda re-use) ─────
interface CacheEntry {
  rates:       Record<string, number>
  timestamp:   number
  lastUpdated: string
}
const rateCache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * GET /api/currency?base=USD&amount=1
 * Returns live exchange rates for all supported currencies.
 * Fetches from exchangerate-api.com and caches results 1 hour.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const base   = (searchParams.get('base') ?? 'USD').toUpperCase()
  const amount = parseFloat(searchParams.get('amount') ?? '1') || 1

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = rateCache.get(base)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return respond(base, amount, cached.rates, cached.lastUpdated)
  }

  // ── Fetch fresh rates ──────────────────────────────────────────────────────
  try {
    const res  = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`exchangerate-api ${res.status}`)

    const json = await res.json() as { rates: Record<string, number>; date: string }

    // Filter to supported currencies only
    const rates: Record<string, number> = {}
    for (const code of CURRENCY_CODES) {
      if (json.rates[code] != null) rates[code] = json.rates[code]
    }
    // Always include base at 1
    rates[base] = 1

    const lastUpdated = new Date().toISOString()
    rateCache.set(base, { rates, timestamp: Date.now(), lastUpdated })

    return respond(base, amount, rates, lastUpdated)
  } catch (err) {
    console.error('[/api/currency]', err)

    // Return stale cache if available, rather than hard-fail
    if (cached) return respond(base, amount, cached.rates, cached.lastUpdated)

    return NextResponse.json(
      { error: 'Failed to fetch exchange rates' },
      { status: 502 },
    )
  }
}

function respond(
  base:        string,
  amount:      number,
  rates:       Record<string, number>,
  lastUpdated: string,
) {
  // Apply amount multiplier
  const converted: Record<string, number> = {}
  for (const [code, rate] of Object.entries(rates)) {
    converted[code] = parseFloat((rate * amount).toFixed(6))
  }

  return NextResponse.json({
    base,
    amount,
    rates: converted,
    lastUpdated,
  })
}
