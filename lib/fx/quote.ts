import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import type { FxEngineQuote, FxPricingContext } from './types'
import { NgnRateUnavailableError } from './types'
import { getFxSettings } from './settings'
import { getNgnRate, adjustmentInBase } from './policy'

/**
 * Quote creation — the single place the USD adjustment enters a price.
 *
 * "Per conversion" means ONCE per customer-facing conversion TOTAL: callers
 * pass the cart/quote/checkout total as baseAmount, and this function adds
 * the adjustment exactly once. Line items must never be converted
 * individually and summed — that would stack the fee.
 *
 * Contexts:
 *  - DISPLAY_ESTIMATE: computed identically (so displays match checkout)
 *    but never persisted — no lock row, no charge can reference it.
 *  - QUOTE / ADMIN_QUOTE / CHECKOUT: persisted as FxQuoteLock so the same
 *    numbers are reused verbatim until expiry (no re-fetch between customer
 *    confirmation and payment creation).
 *
 * All arithmetic is Prisma.Decimal — no floating point money math.
 */
export interface CreateNgnQuoteInput {
  baseCurrency: string
  /** The conversion TOTAL in base currency (major units). */
  baseAmount:   number | string | Prisma.Decimal
  context:      FxPricingContext
  /** Optional linkage (booking ref / cart id) for audit trails. */
  reference?:   string
  traceId?:     string
}

export async function createNgnQuote(input: CreateNgnQuoteInput): Promise<FxEngineQuote> {
  const settings = await getFxSettings()
  const base     = input.baseCurrency.toUpperCase()
  const cacheMs  = settings.cacheMinutes * 60 * 1000

  const baseAmount = new Prisma.Decimal(input.baseAmount as Prisma.Decimal.Value)
  if (baseAmount.lte(0)) throw new Error('baseAmount must be positive')

  const rate    = await getNgnRate(base, settings, input.traceId)
  const adjBase = await adjustmentInBase(base, settings.adjustmentUsd, cacheMs)

  // (base + adjustment) × raw rate — the rate itself is never inflated.
  const adjustedBaseAmount = baseAmount.add(adjBase)
  const convertedAmount    = adjustedBaseAmount.mul(rate.rawRate).toDecimalPlaces(2)
  const effectiveRate      = convertedAmount.div(baseAmount)

  const now       = new Date()
  const expiresAt = new Date(now.getTime() + settings.lockMinutes * 60 * 1000)

  const quote: FxEngineQuote = {
    baseCurrency:  base,
    quoteCurrency: 'NGN',
    baseAmount,
    rawRate:       rate.rawRate,
    effectiveRate,
    rateSource:    rate.rateSource,
    provider:      rate.provider,
    adjustmentUsd:            settings.adjustmentUsd,
    adjustmentCurrency:       'USD',
    adjustmentInBaseCurrency: adjBase.toDecimalPlaces(4),
    adjustedBaseAmount:       adjustedBaseAmount.toDecimalPlaces(4),
    convertedAmount,
    context:   input.context,
    fetchedAt: now,
    expiresAt,
  }

  if (input.context !== 'DISPLAY_ESTIMATE') {
    const lock = await prisma.fxQuoteLock.create({
      data: {
        context:       input.context,
        baseCurrency:  base,
        quoteCurrency: 'NGN',
        baseAmount,
        rawRate:       rate.rawRate,
        effectiveRate: effectiveRate.toDecimalPlaces(8),
        rateSource:    rate.rateSource,
        provider:      rate.provider ?? null,
        adjustmentUsd: settings.adjustmentUsd,
        adjustmentInBaseCurrency: adjBase.toDecimalPlaces(4),
        adjustedBaseAmount:       adjustedBaseAmount.toDecimalPlaces(4),
        convertedAmount,
        rateTimestamp: rate.sourceTimestamp ?? null,
        reference:     input.reference ?? null,
        expiresAt,
      },
    })
    quote.lockId = lock.id
    console.log(`[fx] fx_quote_created lock=${lock.id} pair=${base}/NGN source=${rate.rateSource} context=${input.context} trace=${input.traceId ?? '-'}`)
  }

  return quote
}

export interface LoadedLock {
  id:            string
  baseCurrency:  string
  quoteCurrency: string
  baseAmount:    Prisma.Decimal
  rawRate:       Prisma.Decimal
  rateSource:    string
  adjustmentUsd: Prisma.Decimal
  adjustmentInBaseCurrency: Prisma.Decimal
  convertedAmount: Prisma.Decimal
  createdAt:     Date
  expiresAt:     Date
  usedAt:        Date | null
  expired:       boolean
}

/**
 * Load a persisted lock for checkout. Returns null when the id is unknown.
 * The caller decides how to handle `expired` (revalidate + customer
 * acknowledgement — never a silent amount change).
 */
export async function loadFxLock(lockId: string): Promise<LoadedLock | null> {
  const row = await prisma.fxQuoteLock.findUnique({ where: { id: lockId } })
  if (!row) return null
  const expired = row.expiresAt.getTime() < Date.now()
  if (expired) console.log(`[fx] fx_quote_expired lock=${row.id} pair=${row.baseCurrency}/${row.quoteCurrency}`)
  return {
    id:            row.id,
    baseCurrency:  row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    baseAmount:    row.baseAmount,
    rawRate:       row.rawRate,
    rateSource:    row.rateSource,
    adjustmentUsd: row.adjustmentUsd,
    adjustmentInBaseCurrency: row.adjustmentInBaseCurrency,
    convertedAmount: row.convertedAmount,
    createdAt:     row.createdAt,
    expiresAt:     row.expiresAt,
    usedAt:        row.usedAt,
    expired,
  }
}

/** Mark a lock as consumed by a payment (audit only — reuse stays possible
 *  within expiry, e.g. a retried card). */
export async function markFxLockUsed(lockId: string): Promise<void> {
  await prisma.fxQuoteLock.update({
    where: { id: lockId },
    data:  { usedAt: new Date() },
  }).catch(e => console.error('[fx] lock usedAt update failed:', e instanceof Error ? e.message : e))
}

export { NgnRateUnavailableError }
