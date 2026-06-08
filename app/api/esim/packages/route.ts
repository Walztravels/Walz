import { NextRequest, NextResponse } from 'next/server'
import { applyMarkup, calcMargin, dataLabel, esimHeaders, ESIM_BASE } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

// In-memory cache: { [iso2]: { data, expiresAt } }
const _cache = new Map<string, { data: EsimPackage[]; expiresAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export interface EsimPackage {
  packageCode:    string
  packageName:    string
  slug:           string
  location:       string
  locationCode:   string
  durationDays:   number
  dataGb:         number | null
  dataLabel:      string
  wholesaleUsd:   number
  retailUsd:      number
  marginUsd:      number
  speed:          string
  type:           string   // 'data' | 'voice+data'
}

// ── GET /api/esim/packages?country=GB ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') ?? '').toUpperCase()
  if (!country) {
    return NextResponse.json({ error: 'country param required' }, { status: 400 })
  }

  // Cache hit
  const cached = _cache.get(country)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ packages: cached.data, fromCache: true })
  }

  try {
    const res = await fetch(`${ESIM_BASE}/open/package/list`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({ locationCode: country, type: 1, pageNum: 1, pageSize: 50 }),
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error('[esim/packages] upstream error', res.status, txt)
      return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 502 })
    }

    const json = await res.json()

    // eSIM Access returns { obj: { packageList: [...] } }
    const raw: Record<string, unknown>[] = json?.obj?.packageList ?? []

    const packages: EsimPackage[] = raw.map((p) => {
      const wholesale = Number(p.price ?? p.retailPrice ?? 0) / 10000 // stored in cents×100
      const retail    = applyMarkup(wholesale)
      const gb        = p.volume ? Number(p.volume) / (1024 * 1024 * 1024) : null // bytes → GB

      return {
        packageCode:  String(p.packageCode ?? p.productCode ?? ''),
        packageName:  String(p.name ?? p.packageName ?? ''),
        slug:         String(p.packageCode ?? '').toLowerCase(),
        location:     String(p.locationName ?? p.location ?? country),
        locationCode: country,
        durationDays: Number(p.duration ?? p.validityDay ?? 0),
        dataGb:       gb ? Math.round(gb * 10) / 10 : null,
        dataLabel:    dataLabel(gb),
        wholesaleUsd: Math.round(wholesale * 100) / 100,
        retailUsd:    retail,
        marginUsd:    calcMargin(wholesale, retail),
        speed:        String(p.speed ?? p.networkType ?? '4G/LTE'),
        type:         String(p.type ?? 'data'),
      }
    }).filter(p => p.packageCode && p.retailUsd > 0)

    _cache.set(country, { data: packages, expiresAt: Date.now() + CACHE_TTL })

    return NextResponse.json({ packages, fromCache: false })
  } catch (err) {
    console.error('[esim/packages]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
