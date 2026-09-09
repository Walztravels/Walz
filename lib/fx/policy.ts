import type { FxRate } from './types'
import { NgnRateUnavailableError } from './types'
import { getFxSettings, manualNgnRate, type FxSettings } from './settings'
import { getMonierateNgnRate } from './providers/monierate'
import { getStandardRate } from './providers/standard'
import { Prisma } from '@prisma/client'

/**
 * NGN routing policy for customer-facing conversion INTO NGN:
 *
 *   AUTO_MONIERATE:  Monierate parallel → (unavailable/stale/error) →
 *                    Walz manual rate → (none) → FAIL CLOSED
 *   MANUAL:          Walz manual rate immediately → (none) → FAIL CLOSED
 *
 * We NEVER fall back to an official/interbank USD-NGN rate for customer
 * pricing — failure means NGN_RATE_UNAVAILABLE, nothing else. Conversions
 * that do not target NGN keep the existing standard provider untouched.
 */
export async function getNgnRate(
  baseCurrency: string,
  settingsIn?: FxSettings,
  traceId?: string,
): Promise<FxRate> {
  const settings = settingsIn ?? await getFxSettings()
  const base     = baseCurrency.toUpperCase()
  const cacheMs  = settings.cacheMinutes * 60 * 1000

  const manual = (): FxRate | null => {
    const rate = manualNgnRate(settings, base)
    if (!rate) return null
    return {
      baseCurrency:  base,
      quoteCurrency: 'NGN',
      rawRate:       rate,
      rateSource:    'WALZ_MANUAL',
      provider:      'walz-admin',
      fetchedAt:     new Date(),
    }
  }

  if (settings.rateMode === 'MANUAL') {
    const m = manual()
    if (m) return m
    throw new NgnRateUnavailableError(`manual mode but no manual rate configured for ${base}/NGN`)
  }

  // AUTO_MONIERATE
  const live = await getMonierateNgnRate(base, cacheMs, traceId)
  if (live) return live

  const m = manual()
  if (m) {
    console.log(`[fx] fx_rate_manual_fallback pair=${base}/NGN trace=${traceId ?? '-'}`)
    return m
  }

  console.error(`[fx] fx_rate_unavailable pair=${base}/NGN reason=no-monierate-no-manual trace=${traceId ?? '-'}`)
  throw new NgnRateUnavailableError(`Monierate unavailable and no manual rate for ${base}/NGN`)
}

/**
 * The configured USD adjustment expressed in `baseCurrency`, converted via
 * the standard authoritative (non-NGN) service — never via hardcoded
 * equivalents. USD bases pass through exactly.
 */
export async function adjustmentInBase(
  baseCurrency: string,
  adjustmentUsd: Prisma.Decimal,
  cacheMs: number,
): Promise<Prisma.Decimal> {
  const base = baseCurrency.toUpperCase()
  if (base === 'USD') return adjustmentUsd
  if (adjustmentUsd.isZero()) return new Prisma.Decimal(0)
  const usdToBase = await getStandardRate('USD', base, cacheMs)
  if (!usdToBase) {
    // Without a trustworthy USD→base rate the adjustment cannot be priced,
    // so the whole NGN quote fails closed rather than guessing.
    throw new NgnRateUnavailableError(`cannot convert USD adjustment into ${base}`)
  }
  return adjustmentUsd.mul(usdToBase.rawRate)
}
