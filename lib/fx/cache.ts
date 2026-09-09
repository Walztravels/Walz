import type { FxRate } from './types'

/**
 * Server-side rate cache. Module-level so it survives warm lambda re-use,
 * mirroring the pattern in app/api/currency/route.ts. Only SUCCESSFUL
 * fetches are cached — failures are never stored as rates.
 *
 * Key = base + quote + rate type, so incompatible pairs and markets can
 * never cross-contaminate (USD:NGN:parallel ≠ USD:NGN:standard).
 */
interface CacheEntry {
  rate:      FxRate
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function rateCacheKey(base: string, quote: string, rateType: string): string {
  return `${base.toUpperCase()}:${quote.toUpperCase()}:${rateType}`
}

export function getCachedRate(base: string, quote: string, rateType: string): FxRate | null {
  const key   = rateCacheKey(base, quote, rateType)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.rate
}

export function setCachedRate(rate: FxRate, rateType: string, ttlMs: number): void {
  cache.set(rateCacheKey(rate.baseCurrency, rate.quoteCurrency, rateType), {
    rate,
    expiresAt: Date.now() + ttlMs,
  })
}

/** Test/ops helper — never used in request paths. */
export function clearRateCache(): void {
  cache.clear()
}
