// Server-only — never import this in client components
import { esimHeaders, ESIM_BASE, parsePackage } from '@/lib/esim-pricing'
import type { EsimPackage } from './types'

export async function fetchAllEsimPackages(): Promise<EsimPackage[]> {
  try {
    const res = await fetch(`${ESIM_BASE}/open/package/list`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({ packageCode: '', type: 1 }),
      next:    { revalidate: 21600 },
    })

    if (!res.ok) {
      console.error('[esim/api] HTTP error:', res.status, await res.text().catch(() => ''))
      return []
    }

    const json = await res.json() as {
      success?:  boolean
      errorCode?: string
      errorMsg?:  string
      obj?:       { packageList?: Record<string, unknown>[] }
    }

    if (!json?.success && json?.errorCode !== '0') {
      console.error('[esim/api] API error:', json?.errorMsg)
      return []
    }

    const raw = json?.obj?.packageList ?? []

    const packages: EsimPackage[] = raw
      .map((p) => {
        // The all-packages response includes locationCode per package
        const locationCode = String(
          p.locationCode ?? p.countryCode ?? p.location ?? ''
        ).toUpperCase().trim()

        // Skip multi-country / global packages (no single ISO2 code)
        if (!locationCode || locationCode.length !== 2) return null

        return parsePackage(p, locationCode) as EsimPackage | null
      })
      .filter((p): p is EsimPackage => p !== null)
      .sort((a, b) => a.retailUsd - b.retailUsd)

    console.log(`[esim/api] Loaded ${packages.length} packages across ${new Set(packages.map(p => p.locationCode)).size} countries`)
    return packages
  } catch (err) {
    console.error('[esim/api] Fetch failed:', err)
    return []
  }
}
