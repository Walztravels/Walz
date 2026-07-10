// Server-only — never import this in client components
import { airaloGet, type AiraloPackagesResponse } from '@/lib/airalo'
import { parseAiraloPackage } from '@/lib/esim-pricing'
import type { EsimPackage } from './types'

/**
 * Fetch all Airalo packages across all countries (3 pages of 100).
 * Called at ISR time from the /esim page (revalidate: 21600).
 * Returns a flat EsimPackage[] compatible with the existing EsimSearch component.
 */
export async function fetchAllEsimPackages(): Promise<EsimPackage[]> {
  const packages: EsimPackage[] = []
  const seenCodes = new Set<string>()

  try {
    // Fetch page 1 to discover last_page, then fetch remaining pages in parallel
    const first = await airaloGet<AiraloPackagesResponse>('/packages', { limit: 100, page: 1 })
    const discountPct = first.pricing?.discount_percentage ?? 25
    const lastPage    = first.meta?.last_page ?? 1

    const allPages: AiraloPackagesResponse[] = [first]

    if (lastPage > 1) {
      const rest = await Promise.all(
        Array.from({ length: lastPage - 1 }, (_, i) =>
          airaloGet<AiraloPackagesResponse>('/packages', { limit: 100, page: i + 2 }),
        ),
      )
      allPages.push(...rest)
    }

    for (const page of allPages) {
      for (const country of page.data) {
        if (!country.country_code || country.country_code.length !== 2) continue

        for (const operator of country.operators ?? []) {
          for (const pkg of operator.packages ?? []) {
            if (seenCodes.has(pkg.id)) continue
            seenCodes.add(pkg.id)

            const parsed = parseAiraloPackage(pkg, country, discountPct, operator.info ?? [])
            if (parsed) packages.push(parsed)
          }
        }
      }
    }

    packages.sort((a, b) => a.retailUsd - b.retailUsd)
    console.log(
      `[esim/api] Airalo: loaded ${packages.length} packages across ` +
      `${new Set(packages.map(p => p.locationCode)).size} countries`,
    )
    return packages
  } catch (err) {
    console.error('[esim/api] Airalo fetch failed:', err)
    return []
  }
}

/**
 * Fetch packages for a single country (by ISO2 code).
 * Used by /api/esim/packages?country=XX.
 */
export async function fetchCountryPackages(iso2: string): Promise<EsimPackage[]> {
  try {
    const res = await airaloGet<AiraloPackagesResponse>('/packages', { limit: 300, page: 1 })
    const discountPct = res.pricing?.discount_percentage ?? 25

    const country = res.data.find(
      c => c.country_code.toUpperCase() === iso2.toUpperCase(),
    )
    if (!country) return []

    const packages: EsimPackage[] = []
    for (const operator of country.operators ?? []) {
      for (const pkg of operator.packages ?? []) {
        const parsed = parseAiraloPackage(pkg, country, discountPct, operator.info ?? [])
        if (parsed) packages.push(parsed)
      }
    }

    packages.sort((a, b) => a.retailUsd - b.retailUsd)
    return packages
  } catch (err) {
    console.error(`[esim/api] Airalo country fetch failed (${iso2}):`, err)
    return []
  }
}
