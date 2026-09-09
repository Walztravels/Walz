import { Prisma } from '@prisma/client'

export type Decimal = Prisma.Decimal
export const Decimal = Prisma.Decimal

/** Where the raw NGN rate came from. */
export type FxRateSource =
  | 'MONIERATE_PARALLEL'  // Monierate aggregated parallel-market rate
  | 'WALZ_MANUAL'         // super_admin-configured manual rate
  | 'STANDARD_MARKET'     // existing standard provider (non-NGN conversions)

/**
 * Pricing context decides whether a quote is persisted and how it may be
 * consumed. The USD adjustment is applied once per conversion in EVERY
 * context (so a display estimate matches what checkout will charge) — the
 * context governs persistence and authority, not fee stacking:
 *  - DISPLAY_ESTIMATE: indicative, never persisted, never chargeable
 *  - QUOTE / ADMIN_QUOTE: persisted snapshot attached to a customer quote
 *  - CHECKOUT: persisted rate lock; the ONLY context a payment may charge from
 */
export type FxPricingContext =
  | 'DISPLAY_ESTIMATE'
  | 'QUOTE'
  | 'CHECKOUT'
  | 'ADMIN_QUOTE'

export interface FxRate {
  baseCurrency:  string
  quoteCurrency: string
  /** The real provider/manual rate — never inflated to hide the adjustment. */
  rawRate:       Prisma.Decimal
  rateSource:    FxRateSource
  provider?:     string
  /** Provider's own timestamp for the rate, when supplied. */
  sourceTimestamp?: Date
  fetchedAt:     Date
}

export interface FxEngineQuote {
  baseCurrency:  string
  quoteCurrency: string

  baseAmount:    Prisma.Decimal

  /** Real Monierate/manual rate. */
  rawRate:       Prisma.Decimal
  /** convertedAmount / baseAmount — derived, shown for transparency only. */
  effectiveRate: Prisma.Decimal

  rateSource:    FxRateSource
  provider?:     string

  /** Configured adjustment, always denominated in USD. */
  adjustmentUsd:            Prisma.Decimal
  adjustmentCurrency:       'USD'
  /** The USD adjustment expressed in the base currency (equal for USD bases). */
  adjustmentInBaseCurrency: Prisma.Decimal

  adjustedBaseAmount: Prisma.Decimal
  convertedAmount:    Prisma.Decimal

  context:   FxPricingContext
  fetchedAt: Date
  expiresAt: Date

  /** Present when the quote was persisted (QUOTE / CHECKOUT / ADMIN_QUOTE). */
  lockId?: string
}

/** JSON-safe shape of FxEngineQuote for API responses / client consumption. */
export interface FxEngineQuoteJson {
  baseCurrency:  string
  quoteCurrency: string
  baseAmount:    string
  rawRate:       string
  effectiveRate: string
  rateSource:    FxRateSource
  provider?:     string
  adjustmentUsd:            string
  adjustmentCurrency:       'USD'
  adjustmentInBaseCurrency: string
  adjustedBaseAmount: string
  convertedAmount:    string
  context:   FxPricingContext
  fetchedAt: string
  expiresAt: string
  lockId?:   string
}

export const NGN_RATE_UNAVAILABLE = 'NGN_RATE_UNAVAILABLE'

/** Customer-safe message — never expose provider errors to the browser. */
export const NGN_RATE_UNAVAILABLE_MESSAGE =
  'NGN pricing is temporarily unavailable. Please try again shortly.'

export class NgnRateUnavailableError extends Error {
  readonly code = NGN_RATE_UNAVAILABLE
  constructor(internalDetail: string) {
    super(internalDetail)
    this.name = 'NgnRateUnavailableError'
  }
}

export function quoteToJson(q: FxEngineQuote): FxEngineQuoteJson {
  return {
    baseCurrency:  q.baseCurrency,
    quoteCurrency: q.quoteCurrency,
    baseAmount:    q.baseAmount.toFixed(2),
    rawRate:       q.rawRate.toString(),
    effectiveRate: q.effectiveRate.toFixed(6),
    rateSource:    q.rateSource,
    provider:      q.provider,
    adjustmentUsd:            q.adjustmentUsd.toFixed(2),
    adjustmentCurrency:       'USD',
    adjustmentInBaseCurrency: q.adjustmentInBaseCurrency.toFixed(4),
    adjustedBaseAmount: q.adjustedBaseAmount.toFixed(4),
    convertedAmount:    q.convertedAmount.toFixed(2),
    context:   q.context,
    fetchedAt: q.fetchedAt.toISOString(),
    expiresAt: q.expiresAt.toISOString(),
    lockId:    q.lockId,
  }
}
