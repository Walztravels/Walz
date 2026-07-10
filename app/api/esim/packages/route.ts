import { NextRequest, NextResponse } from 'next/server'
import { fetchCountryPackages } from '@/lib/esim/api'
import type { EsimPackage } from '@/lib/esim/types'

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
    const packages = await fetchCountryPackages(country)
    _cache.set(country, { data: packages, expiresAt: Date.now() + CACHE_TTL })
    return NextResponse.json({ packages, country, count: packages.length, cached: false })
  } catch (err) {
    console.error('[esim/packages]', err)
    return NextResponse.json({ error: 'Internal error', packages: [] }, { status: 500 })
  }
}
