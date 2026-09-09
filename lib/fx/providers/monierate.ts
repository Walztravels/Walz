import { Prisma } from '@prisma/client'
import type { FxRate } from '../types'
import { getCachedRate, setCachedRate } from '../cache'
import { getStandardRate } from './standard'

/**
 * Monierate parallel-market BUY-side adapter (server-side ONLY — the
 * api_key must never reach browser code).
 *
 * Business rule: when a customer pays NGN for a product whose commercial
 * value is USD/GBP/CAD/EUR/AED, Walz must recover the foreign-currency
 * value, so the authoritative side is Monierate's BUY price — the NGN
 * required to obtain 1 unit of the foreign currency. Verified live against
 * Monierate's pair data: buy > sell on healthy pairs (e.g. USDNGN buy
 * 1375.13 / sell 1369.08 / composite 1373.04).
 *
 * Contract (docs.monierate.com, verified 2026-09):
 *   GET {MONIERATE_API_URL}/pairs/{code}          e.g. /pairs/usdngn
 *   Header: api_key: <MONIERATE_API_KEY>
 *   → { status: 'success', data: { pair: {
 *        code, is_active,
 *        price: { average, current, buy, sell },
 *        updatedAt } } }
 *
 * Selection: price.buy, and ONLY price.buy. price.sell is never used for
 * commercial pricing. The composite (price.current/average) is never used
 * as the commercial rate — it serves solely as a sanity reference: a BUY
 * value that is missing, non-finite, ≤ 0, from the wrong pair, stale, or
 * materially out of line with the composite is treated as bad provider
 * data and rejected, and the engine falls through to the Walz MANUAL rate
 * (then fails closed) exactly as before. We never substitute the
 * composite, never take max(buy, current), and never average buy/sell.
 *
 * USD bridge: when a direct <base>→NGN pair is unavailable, derive
 *   rate(base→NGN) = BUY(USD→NGN) × rate(base→USD, standard)
 * deterministically — the parallel BUY side applies to the USD↔NGN leg.
 *
 * The commercial cushion is always the separate, explicit USD adjustment —
 * never a doctored rate.
 */

const RATE_TYPE = 'monierate_parallel_buy'

/** A rate whose provider timestamp is older than this is stale → the
 *  caller falls back to the Walz manual rate. (Unchanged policy.) */
export const MONIERATE_MAX_SOURCE_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Sanity threshold for detecting BAD PROVIDER DATA, not for adjusting
 * valid rates: when the composite (price.current) is present, a BUY value
 * deviating from it by more than this fraction is rejected as anomalous
 * (thin/inverted contributor books occasionally produce garbage — e.g.
 * CADNGN has been observed with buy < sell). 10% is far outside the
 * honest buy↔composite spread ever observed on these pairs (≤ ~2%), so it
 * only trips on genuinely broken data while never touching real rates.
 */
export const MONIERATE_BUY_SANITY_MAX_DEVIATION = 0.10

const FETCH_TIMEOUT_MS = 8_000

function apiBase(): string {
  return (process.env.MONIERATE_API_URL ?? 'https://api.monierate.com/core').replace(/\/$/, '')
}

interface MoneriatePairPrice {
  average?: number
  current?: number
  buy?:     number
  sell?:    number
}

interface MoneriatePairResponse {
  status?: string
  data?: {
    pair?: {
      code?:      string
      is_active?: boolean
      price?:     MoneriatePairPrice
      updatedAt?: string
    }
    // some deployments flatten the pair object into data directly
    code?:      string
    price?:     MoneriatePairPrice
    updatedAt?: string
  }
}

type BuyFetchResult =
  | { ok: true; rate: FxRate }
  // 'unavailable': network/HTTP/missing key — the USD bridge MAY cover it.
  // 'rejected': the provider ANSWERED but the data failed validation
  // (invalid/anomalous/inverted/unparseable) — no bridging, no composite
  // substitution: fall straight through to the Walz manual rate.
  | { ok: false; reason: 'unavailable' | 'rejected' }

/**
 * Fetch the pair's BUY rate with full validation. Any doubt returns a
 * non-ok result — the caller owns the manual-fallback / fail-closed policy.
 */
async function fetchParallelBuyRate(base: string): Promise<BuyFetchResult> {
  const key = process.env.MONIERATE_API_KEY
  if (!key) return { ok: false, reason: 'unavailable' } // manual fallback — never crashes the app

  const code = `${base.toLowerCase()}ngn`

  // Documented path first; .json variant second (Monierate's rates
  // endpoints use the suffix, the pairs doc shows it without).
  let json: MoneriatePairResponse | null = null
  for (const path of [`/pairs/${code}`, `/pairs/${code}.json`]) {
    try {
      const res = await fetch(`${apiBase()}${path}`, {
        headers: { api_key: key },
        signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next:    { revalidate: 0 },
      })
      if (res.ok) {
        json = await res.json() as MoneriatePairResponse
        break
      }
      // Status only — provider error bodies are never logged or surfaced.
      console.error(`[fx] fx_rate_unavailable provider=monierate pair=${base}/NGN path=${path} http=${res.status}`)
    } catch (e) {
      console.error(`[fx] fx_rate_unavailable provider=monierate pair=${base}/NGN error=${e instanceof Error ? e.message : 'unknown'}`)
      return { ok: false, reason: 'unavailable' }
    }
  }
  if (!json || json.status !== 'success' || !json.data) return { ok: false, reason: 'unavailable' }

  const pair  = json.data.pair ?? json.data
  const price = pair?.price

  // ── Validation: requested pair must be the returned pair ──────────────────
  if (pair?.code && pair.code.toLowerCase() !== code) {
    console.error(`[fx] fx_rate_rejected provider=monierate reason=pair_mismatch requested=${code} got=${pair.code}`)
    return { ok: false, reason: 'rejected' }
  }

  // ── Validation: BUY must be numeric, finite, > 0 ──────────────────────────
  const buy = price?.buy
  if (typeof buy !== 'number' || !Number.isFinite(buy) || buy <= 0) {
    console.error(`[fx] fx_rate_rejected provider=monierate pair=${base}/NGN reason=buy_invalid`)
    return { ok: false, reason: 'rejected' }
  }

  // ── Sanity vs composite: reject anomalous provider data ───────────────────
  // (Detection only — a valid BUY is used verbatim, never modified.)
  const current = price?.current ?? price?.average
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) {
    const deviation = Math.abs(buy - current) / current
    if (deviation > MONIERATE_BUY_SANITY_MAX_DEVIATION) {
      console.error(`[fx] fx_rate_rejected provider=monierate pair=${base}/NGN reason=buy_anomalous buy=${buy} current=${current} deviation=${deviation.toFixed(4)}`)
      return { ok: false, reason: 'rejected' }
    }
  }
  // An inverted book (buy below sell) is bad data on its face — the BUY
  // side can never honestly cost less NGN than the SELL side pays out.
  const sell = price?.sell
  if (typeof sell === 'number' && Number.isFinite(sell) && sell > 0 && buy < sell) {
    console.error(`[fx] fx_rate_rejected provider=monierate pair=${base}/NGN reason=inverted_book buy=${buy} sell=${sell}`)
    return { ok: false, reason: 'rejected' }
  }

  const sourceTimestamp = pair?.updatedAt ? new Date(pair.updatedAt) : undefined
  if (sourceTimestamp && Number.isNaN(sourceTimestamp.getTime())) {
    return { ok: false, reason: 'rejected' }
  }

  return {
    ok: true,
    rate: {
      baseCurrency:  base.toUpperCase(),
      quoteCurrency: 'NGN',
      rawRate:       new Prisma.Decimal(String(buy)),
      rateSource:    'MONIERATE_PARALLEL_BUY',
      provider:      'monierate',
      sourceTimestamp,
      fetchedAt:     new Date(),
    },
  }
}

export function isStaleMonierateRate(rate: FxRate, now = Date.now()): boolean {
  if (!rate.sourceTimestamp) return false // no provider timestamp → trust fetch time
  return now - rate.sourceTimestamp.getTime() > MONIERATE_MAX_SOURCE_AGE_MS
}

/**
 * base→NGN parallel BUY rate, cached `cacheMs`, with deterministic USD
 * bridge. Returns null on any failure or doubt — the caller (policy.ts)
 * owns the manual fallback and the fail-closed behaviour.
 */
export async function getMonierateNgnRate(
  base: string,
  cacheMs: number,
  traceId?: string,
): Promise<FxRate | null> {
  const upper = base.toUpperCase()

  const cached = getCachedRate(upper, 'NGN', RATE_TYPE)
  if (cached && !isStaleMonierateRate(cached)) {
    console.log(`[fx] fx_rate_cache_hit pair=${upper}/NGN source=MONIERATE_PARALLEL_BUY trace=${traceId ?? '-'}`)
    return cached
  }

  try {
    // 1. Direct pair (BUY side)
    const direct = await fetchParallelBuyRate(upper)
    if (direct.ok && !isStaleMonierateRate(direct.rate)) {
      setCachedRate(direct.rate, RATE_TYPE, cacheMs)
      const age = direct.rate.sourceTimestamp ? Date.now() - direct.rate.sourceTimestamp.getTime() : null
      console.log(`[fx] fx_rate_fetched pair=${upper}/NGN source=MONIERATE_PARALLEL_BUY ageMs=${age ?? 'n/a'} trace=${traceId ?? '-'}`)
      return direct.rate
    }

    // Rejected data (anomalous/invalid/inverted) or a stale direct answer
    // is NOT bridged around — the Walz manual rate is the specified next
    // step, and the composite is never substituted.
    if ((!direct.ok && direct.reason === 'rejected') ||
        (direct.ok && isStaleMonierateRate(direct.rate))) {
      console.log(`[fx] fx_rate_manual_candidate pair=${upper}/NGN reason=rejected_or_stale trace=${traceId ?? '-'}`)
      return null
    }

    // 2. USD bridge — only when the direct pair was genuinely UNAVAILABLE
    if (upper !== 'USD') {
      const usdLeg = await fetchParallelBuyRate('USD')
      if (usdLeg.ok && !isStaleMonierateRate(usdLeg.rate)) {
        const baseToUsd = await getStandardRate(upper, 'USD', cacheMs)
        if (baseToUsd) {
          const bridged: FxRate = {
            baseCurrency:  upper,
            quoteCurrency: 'NGN',
            rawRate:       usdLeg.rate.rawRate.mul(baseToUsd.rawRate),
            rateSource:    'MONIERATE_PARALLEL_BUY',
            provider:      'monierate+usd-bridge',
            sourceTimestamp: usdLeg.rate.sourceTimestamp,
            fetchedAt:     new Date(),
          }
          setCachedRate(bridged, RATE_TYPE, cacheMs)
          console.log(`[fx] fx_rate_fetched pair=${upper}/NGN source=MONIERATE_PARALLEL_BUY bridge=USD trace=${traceId ?? '-'}`)
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
