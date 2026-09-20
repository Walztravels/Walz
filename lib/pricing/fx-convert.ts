/**
 * V1.3 Quote Builder — server-authoritative supplier→quote-currency
 * conversion. Every call in this file happens SERVER-SIDE ONLY (inside an
 * API route, never in browser code) — this is the one and only place a
 * supplier amount is converted into the quote's client-facing currency.
 *
 * Non-negotiable invariants (per the V1.3 brief):
 *  - never relabel: a converted amount is ALWAYS the result of a real
 *    multiplication by a real, freshly-fetched-or-cached rate — never a
 *    same-value passthrough dressed up in a different currency string,
 *    except the genuine identity case (supplierCurrency === targetCurrency).
 *  - never fabricate a fallback rate: any failure returns `ok:false`, never
 *    a synthesized 1:1 or "last known good" rate.
 *  - client-submitted rates/converted amounts are NEVER accepted as input
 *    here — callers must always pass the ORIGINAL supplier amount+currency
 *    (already independently verified against the live supplier where that
 *    exists — flight/hotel revalidation) and let this module compute the
 *    converted figure itself.
 *
 * Reuses lib/fx's existing generic `getStandardRate` provider (confirmed,
 * by the V1.3 architecture audit, to have zero coupling to
 * WALZ_NGN_FX_ENGINE_ENABLED — that flag only gates the NGN quote-lock
 * engine, never this provider) rather than building a second FX client.
 * This module does not touch `lib/fx`'s NGN-specific settings/policy/quote
 * machinery at all — the NGN engine and this module are independent
 * consumers of the same underlying rate provider.
 */
import { Prisma } from '@prisma/client'
import { getStandardRate } from '@/lib/fx'

// Matches the NGN engine's own default cache window (lib/fx/settings.ts's
// FX_DEFAULTS.cacheMinutes) — short enough that no single stale-rate window
// spans more than a short staff working session, long enough that building
// out a multi-item quote doesn't trigger a fresh external call per click.
// Deliberately NOT read from getFxSettings()/FxSettings — that table is
// NGN-specific admin config and must not be coupled to this pipeline.
export const QUOTE_FX_CACHE_MS = 10 * 60 * 1000

// All five initial target currencies (USD/GBP/CAD/EUR/NGN) are standard
// 2-decimal-minor-unit currencies. Kept as a lookup (not a hardcoded /100)
// so a future 0- or 3-decimal currency can be added without touching the
// conversion arithmetic itself.
const MINOR_UNIT_DECIMALS: Record<string, number> = {
  USD: 2, GBP: 2, CAD: 2, EUR: 2, NGN: 2,
}
function minorUnitDecimals(currency: string): number {
  return MINOR_UNIT_DECIMALS[currency.toUpperCase()] ?? 2
}

// Broad, currency-agnostic sanity band — not a precise per-pair reference
// (which would need constant upkeep across an expanding currency list),
// just a guard against an obviously-broken provider response (e.g. an
// inverted rate, a unit/decimal error upstream). getStandardRate() already
// rejects <=0/non-finite/NaN; this is an additional, wider backstop.
const MIN_PLAUSIBLE_RATE = 0.0001
const MAX_PLAUSIBLE_RATE = 10_000

export type FxConvertFailureCode = 'FX_RATE_UNAVAILABLE' | 'FX_RATE_IMPLAUSIBLE'

export interface FxConvertSuccess {
  ok: true
  convertedAmountMinor: number
  rate: string           // decimal string, e.g. "1.27000000"
  rateTimestamp: string  // ISO — when this module's rate lookup ran
  source: string         // e.g. "exchangerate-api" | "identity"
}
export interface FxConvertFailure {
  ok: false
  code: FxConvertFailureCode
  message: string        // safe, staff-facing
}
export type FxConvertResult = FxConvertSuccess | FxConvertFailure

export interface ConvertSupplierAmountInput {
  supplierAmountMinor: number
  supplierCurrency: string
  targetCurrency: string
  /** Optional — only for log correlation, never persisted. */
  traceId?: string
}

/**
 * THE single authoritative minor-unit conversion arithmetic, for every
 * amount a quote item carries — supplier cost, markup, and service fee
 * alike. Given an already-fetched rate (as the exact decimal STRING
 * getStandardRate returned — never a `Number`-cast copy of it, which would
 * reintroduce the binary-floating-point representation error this exists
 * to avoid), converts one minor-unit integer amount.
 *
 * Callers must reuse the ONE rate fetched for a row's cost conversion for
 * that same row's markup/service-fee scaling too (never re-fetch per
 * field) — both so a provider rate change mid-request can't split one
 * item's cost/markup/fee across two different rates, and so cost+markup+
 * fee=selling holds by construction against a single shared rate.
 *
 * Decimal end to end, rounds only once, at the final minor-unit boundary.
 * Never native `Number` multiplication of the minor-unit integer, which
 * silently disagrees with exact decimal arithmetic at exact-.5-cent
 * boundaries (e.g. 100 minor units * "1.005" — native float multiplication
 * yields 100.49999999999999, rounding DOWN to 100; Decimal string
 * arithmetic yields exactly 100.5, rounding UP to 101 as the true product
 * demands). At realistic quote amounts this is not a rounding-direction
 * coin-flip, it is a deterministic, provably-wrong answer from float math.
 */
export function convertMinorUnitAmount(amountMinor: number, rate: string, targetCurrency: string): number {
  const decimals = minorUnitDecimals(targetCurrency)
  const majorAmount = new Prisma.Decimal(amountMinor).div(100)
  const convertedMajor = majorAmount.mul(rate).toDecimalPlaces(decimals)
  return convertedMajor.mul(Math.pow(10, decimals)).toDecimalPlaces(0).toNumber()
}

/**
 * Converts an integer minor-unit supplier amount into the target currency's
 * minor units, server-side, using lib/fx's generic standard-market provider.
 * Never throws — every failure mode returns `{ ok: false, code, message }`.
 */
export async function convertSupplierAmount(
  input: ConvertSupplierAmountInput,
): Promise<FxConvertResult> {
  const { supplierAmountMinor, traceId } = input
  const from = input.supplierCurrency.toUpperCase()
  const to = input.targetCurrency.toUpperCase()

  const rate = await getStandardRate(from, to, QUOTE_FX_CACHE_MS)

  if (!rate) {
    console.error(`[fx-convert] rate_unavailable pair=${from}/${to} traceId=${traceId ?? ''}`)
    return {
      ok: false,
      code: 'FX_RATE_UNAVAILABLE',
      message: `Could not verify a live exchange rate for ${from} to ${to} right now. Please try again shortly.`,
    }
  }

  const rawRate = Number(rate.rawRate.toString())
  if (!Number.isFinite(rawRate) || rawRate < MIN_PLAUSIBLE_RATE || rawRate > MAX_PLAUSIBLE_RATE) {
    console.error(`[fx-convert] rate_implausible pair=${from}/${to} rate=${rate.rawRate.toString()} traceId=${traceId ?? ''}`)
    return {
      ok: false,
      code: 'FX_RATE_IMPLAUSIBLE',
      message: `The exchange rate returned for ${from} to ${to} looked incorrect. No item was added — please try again.`,
    }
  }

  const rateStr = rate.rawRate.toString()
  const convertedAmountMinor = convertMinorUnitAmount(supplierAmountMinor, rateStr, to)

  return {
    ok: true,
    convertedAmountMinor,
    rate: rateStr,
    rateTimestamp: rate.fetchedAt.toISOString(),
    source: rate.provider ?? rate.rateSource,
  }
}
