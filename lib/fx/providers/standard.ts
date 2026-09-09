import { Prisma } from '@prisma/client'
import type { FxRate } from '../types'
import { getCachedRate, setCachedRate } from '../cache'

/**
 * Standard-market provider — the SAME source the site already uses for
 * display conversion (exchangerate-api.com, see app/api/currency/route.ts).
 * Used for:
 *  - all non-NGN conversions (existing behavior, unchanged)
 *  - converting the USD FX adjustment into non-USD base currencies
 *  - the base↔USD leg of the Monierate USD bridge
 *
 * NEVER used as a customer-facing NGN rate — the NGN policy fails closed
 * to manual rather than quietly serving an official USD/NGN rate.
 */

const RATE_TYPE = 'standard'
const FETCH_TIMEOUT_MS = 8_000

interface ExchangeRateApiResponse {
  rates?: Record<string, number>
}

export async function getStandardRate(
  base: string,
  quote: string,
  cacheMs: number,
): Promise<FxRate | null> {
  const from = base.toUpperCase()
  const to   = quote.toUpperCase()

  if (from === to) {
    return {
      baseCurrency: from, quoteCurrency: to,
      rawRate: new Prisma.Decimal(1),
      rateSource: 'STANDARD_MARKET', provider: 'identity', fetchedAt: new Date(),
    }
  }

  const cached = getCachedRate(from, to, RATE_TYPE)
  if (cached) return cached

  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next:   { revalidate: 0 },
    })
    if (!res.ok) return null
    const json = await res.json() as ExchangeRateApiResponse
    const raw  = json.rates?.[to]
    if (!raw || !Number.isFinite(raw) || raw <= 0) return null

    const rate: FxRate = {
      baseCurrency:  from,
      quoteCurrency: to,
      rawRate:       new Prisma.Decimal(String(raw)),
      rateSource:    'STANDARD_MARKET',
      provider:      'exchangerate-api',
      fetchedAt:     new Date(),
    }
    setCachedRate(rate, RATE_TYPE, cacheMs)
    return rate
  } catch (e) {
    console.error(`[fx] fx_rate_unavailable provider=exchangerate-api pair=${from}/${to} error=${e instanceof Error ? e.message : 'unknown'}`)
    return null
  }
}
