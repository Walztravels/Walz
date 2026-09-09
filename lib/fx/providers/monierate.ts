import { Prisma } from '@prisma/client'
import type { FxRate } from '../types'
import { getCachedRate, setCachedRate } from '../cache'
import { getStandardRate } from './standard'

/**
 * Monierate parallel-market adapter (server-side ONLY — the api_key must
 * never reach browser code, so this module is imported exclusively from
 * server routes/services).
 *
 * Contract (docs.monierate.com, verified 2026-09):
 *   GET {MONIERATE_API_URL}/rates/latest.json?base=USD&quote=NGN&market=parallel
 *   Header: api_key: <MONIERATE_API_KEY>
 *   → { status: 'success', data: { timestamp, base, market, rates: <number> } }
 *
 * Rate side: the latest-rates endpoint returns Monierate's AGGREGATED
 * parallel-market value per pair — a composite of parallel-market quotes,
 * not an official/interbank midpoint and not a per-platform buy or sell
 * leg (those exist only on the pairs/quote endpoint). We use the parallel
 * aggregate because it is the street benchmark Walz prices against; the
 * commercial cushion is the separate, explicit USD adjustment — never a
 * doctored rate.
 *
 * USD bridge: if Monierate cannot serve a direct <base>→NGN parallel rate
 * (e.g. an unsupported base), we derive it deterministically as
 *   rate(base→NGN) = rate(USD→NGN, parallel) × rate(base→USD, standard)
 * i.e. the parallel market applies to the USD↔NGN leg, and the base↔USD
 * leg uses the standard authoritative provider.
 */

const RATE_TYPE = 'monierate_parallel'

/** A parallel rate whose provider timestamp is older than this is stale →
 *  the caller falls back to the Walz manual rate. */
export const MONIERATE_MAX_SOURCE_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

const FETCH_TIMEOUT_MS = 8_000

function apiBase(): string {
  return (process.env.MONIERATE_API_URL ?? 'https://api.monierate.com/core').replace(/\/$/, '')
}

interface MonierateLatestResponse {
  status?: string
  data?: {
    timestamp?: number
    base?:      string
    market?:    string
    rates?:     number | Record<string, number>
  }
}

async function fetchParallelRate(base: string): Promise<FxRate | null> {
  const key = process.env.MONIERATE_API_KEY
  if (!key) return null // engine falls back to manual — never crashes the app

  const url = `${apiBase()}/rates/latest.json?base=${encodeURIComponent(base)}&quote=NGN&market=parallel`
  const res = await fetch(url, {
    headers: { api_key: key },
    signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next:    { revalidate: 0 },
  })
  if (!res.ok) {
    // Status only — provider error bodies are never logged or surfaced.
    console.error(`[fx] fx_rate_unavailable provider=monierate pair=${base}/NGN http=${res.status}`)
    return null
  }
  const json = await res.json() as MonierateLatestResponse
  if (json.status !== 'success' || !json.data) return null

  const raw = typeof json.data.rates === 'number'
    ? json.data.rates
    : json.data.rates?.NGN
  if (!raw || !Number.isFinite(raw) || raw <= 0) return null

  const sourceTimestamp = json.data.timestamp ? new Date(json.data.timestamp) : undefined
  return {
    baseCurrency:  base.toUpperCase(),
    quoteCurrency: 'NGN',
    rawRate:       new Prisma.Decimal(String(raw)),
    rateSource:    'MONIERATE_PARALLEL',
    provider:      'monierate',
    sourceTimestamp,
    fetchedAt:     new Date(),
  }
}

export function isStaleMonierateRate(rate: FxRate, now = Date.now()): boolean {
  if (!rate.sourceTimestamp) return false // no provider timestamp → trust fetch time
  return now - rate.sourceTimestamp.getTime() > MONIERATE_MAX_SOURCE_AGE_MS
}

/**
 * base→NGN parallel rate, cached `cacheMs`, with deterministic USD bridge.
 * Returns null on any failure — the caller (policy.ts) owns the fallback.
 */
export async function getMonierateNgnRate(
  base: string,
  cacheMs: number,
  traceId?: string,
): Promise<FxRate | null> {
  const upper = base.toUpperCase()

  const cached = getCachedRate(upper, 'NGN', RATE_TYPE)
  if (cached && !isStaleMonierateRate(cached)) {
    console.log(`[fx] fx_rate_cache_hit pair=${upper}/NGN source=MONIERATE_PARALLEL trace=${traceId ?? '-'}`)
    return cached
  }

  try {
    // 1. Direct pair
    const direct = await fetchParallelRate(upper)
    if (direct && !isStaleMonierateRate(direct)) {
      setCachedRate(direct, RATE_TYPE, cacheMs)
      const age = direct.sourceTimestamp ? Date.now() - direct.sourceTimestamp.getTime() : null
      console.log(`[fx] fx_rate_fetched pair=${upper}/NGN source=MONIERATE_PARALLEL ageMs=${age ?? 'n/a'} trace=${traceId ?? '-'}`)
      return direct
    }

    // 2. USD bridge for non-USD bases
    if (upper !== 'USD') {
      const usdLeg = await fetchParallelRate('USD')
      if (usdLeg && !isStaleMonierateRate(usdLeg)) {
        const baseToUsd = await getStandardRate(upper, 'USD', cacheMs)
        if (baseToUsd) {
          const bridged: FxRate = {
            baseCurrency:  upper,
            quoteCurrency: 'NGN',
            rawRate:       usdLeg.rawRate.mul(baseToUsd.rawRate),
            rateSource:    'MONIERATE_PARALLEL',
            provider:      'monierate+usd-bridge',
            sourceTimestamp: usdLeg.sourceTimestamp,
            fetchedAt:     new Date(),
          }
          setCachedRate(bridged, RATE_TYPE, cacheMs)
          console.log(`[fx] fx_rate_fetched pair=${upper}/NGN source=MONIERATE_PARALLEL bridge=USD trace=${traceId ?? '-'}`)
          return bridged
        }
      }
    }
  } catch (e) {
    // Timeouts / network — message only, never headers or bodies.
    console.error(`[fx] fx_rate_unavailable provider=monierate pair=${upper}/NGN error=${e instanceof Error ? e.message : 'unknown'} trace=${traceId ?? '-'}`)
  }

  return null
}
