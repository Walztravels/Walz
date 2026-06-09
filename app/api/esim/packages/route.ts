import { NextRequest, NextResponse } from 'next/server'
import { esimHeaders, ESIM_BASE, parsePackage, EsimPackage } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

// In-process 1-hour cache keyed by ISO2 country code
const _cache = new Map<string, { data: EsimPackage[]; expiresAt: number }>()
const CACHE_TTL = 60 * 60 * 1000

export type { EsimPackage }

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') ?? '').toUpperCase().trim()
  if (!country) {
    return NextResponse.json({ error: 'country query param required (ISO2)' }, { status: 400 })
  }

  // Cache hit
  const hit = _cache.get(country)
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json({ packages: hit.data, country, cached: true })
  }

  try {
    const res = await fetch(`${ESIM_BASE}/open/package/list`, {
      method:  'POST',
      headers: esimHeaders(),
      // Exact body format per eSIM Access docs
      body: JSON.stringify({
        locationCode: country,
        type:         null,
        slug:         null,
        packageCode:  null,
        iccid:        null,
      }),
    })

    const json = await res.json()

    if (!json?.success && json?.errorCode !== '0') {
      console.error('[esim/packages] API error:', json)
      return NextResponse.json({ error: json?.errorMsg ?? 'Failed to fetch packages', packages: [] }, { status: 200 })
    }

    const raw: Record<string, unknown>[] = json?.obj?.packageList ?? []

    const packages: EsimPackage[] = raw
      .map(p => parsePackage(p, country))
      .filter((p): p is EsimPackage => p !== null)
      .sort((a, b) => a.retailUsd - b.retailUsd)

    _cache.set(country, { data: packages, expiresAt: Date.now() + CACHE_TTL })

    return NextResponse.json({ packages, country, count: packages.length, cached: false })
  } catch (err) {
    console.error('[esim/packages]', err)
    return NextResponse.json({ error: 'Internal error', packages: [] }, { status: 500 })
  }
}
