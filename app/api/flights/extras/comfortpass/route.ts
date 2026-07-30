// GET /api/flights/extras/comfortpass?airport=LHR
// Returns live-priced extras for the four ComfortPass-backed services.
// Cached per airport for 15 minutes. Falls back to { services: [] } if
// ComfortPass is unavailable — the extras page hides CP items in that case.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }         from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient } from '@/lib/concierge/suppliers/comfortpass/client'
import { cacheGet, cacheSet } from '@/lib/redis'

export const dynamic = 'force-dynamic'

const CACHE_TTL_SECONDS = 15 * 60  // 15 minutes

// Maps CP service type → our extra ID
const CP_TYPE_TO_EXTRA_ID: Record<string, string> = {
  lounge:     'lounge',
  fast_track: 'fasttrack',
  transfer:   'transfer',
  meet_greet: 'meetgreet',
}

export interface CPExtraPrice {
  extraId:     string    // our ID: 'lounge' | 'fasttrack' | 'transfer' | 'meetgreet'
  serviceCode: string    // ComfortPass service code
  name:        string
  price:       number    // raw amount in `currency`
  currency:    string
  perPerson:   boolean
}

export interface CPExtrasResult {
  airport:  string
  services: CPExtraPrice[]
}

export async function GET(req: NextRequest) {
  const airport = req.nextUrl.searchParams.get('airport')?.toUpperCase().trim()
  if (!airport || !/^[A-Z]{3}$/.test(airport)) {
    return NextResponse.json({ error: 'airport must be a 3-letter IATA code' }, { status: 400 })
  }

  const cacheKey = `comfortpass:extras:${airport}`

  // ── Try cache first ────────────────────────────────────────────────────────
  try {
    const cached = await cacheGet<CPExtrasResult>(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=900' },
      })
    }
  } catch {
    // Redis unavailable — continue to live fetch
  }

  // ── ComfortPass not configured ─────────────────────────────────────────────
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ airport, services: [] } satisfies CPExtrasResult)
  }

  // ── Live fetch ─────────────────────────────────────────────────────────────
  try {
    const client   = new ComfortPassClient(config)
    const allSvcs  = await client.searchServices({ airport })

    // Pick the first service per CP type (API order is assumed by relevance)
    const byType = new Map<string, typeof allSvcs[0]>()
    for (const svc of allSvcs) {
      const extraId = CP_TYPE_TO_EXTRA_ID[svc.type]
      if (extraId && !byType.has(extraId)) {
        byType.set(extraId, svc)
      }
    }

    // Fetch price for each matched service in parallel; skip silently on failure
    const services: CPExtraPrice[] = []
    await Promise.allSettled(
      [...byType.entries()].map(async ([extraId, svc]) => {
        try {
          const price = await client.getPrice(svc.code)
          services.push({
            extraId,
            serviceCode: svc.code,
            name:        svc.name,
            price:       price.amount,
            currency:    price.currency,
            perPerson:   price.perPerson,
          })
        } catch (err) {
          console.warn(`[cp-extras] price fetch failed for ${svc.code} (${extraId}):`, (err as Error).message)
        }
      }),
    )

    const result: CPExtrasResult = { airport, services }

    // ── Write to cache (best-effort) ─────────────────────────────────────────
    try {
      await cacheSet(cacheKey, result, CACHE_TTL_SECONDS)
    } catch {
      // Redis write failed — serve the result uncached this time
    }

    return NextResponse.json(result, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, max-age=900' },
    })
  } catch (err) {
    // ComfortPass API error — return empty so the extras page hides CP items
    console.error('[cp-extras] ComfortPass unavailable:', (err as Error).message)
    return NextResponse.json({ airport, services: [] } satisfies CPExtrasResult)
  }
}
