import type { ActivitySupplier, ActivityPricingResult } from './types'

const DEFAULT_MARKUP_PERCENT = 20

// Per-supplier markup overrides. Override via env or DB in future.
const SUPPLIER_MARKUP: Partial<Record<ActivitySupplier, number>> = {
  HOTELBEDS: 20,
  VIATOR:    18,
}

/**
 * Apply Walz markup to a supplier net price.
 * Returns integer minor units to avoid floating-point drift.
 */
export function applyActivityMarkup(
  supplierNetPrice: number,
  supplier: ActivitySupplier,
  currency: string = 'GBP',
): ActivityPricingResult {
  const markupPercent = SUPPLIER_MARKUP[supplier] ?? DEFAULT_MARKUP_PERCENT
  const markupAmount  = Math.round(supplierNetPrice * markupPercent) / 100
  const sellingPrice  = Math.round((supplierNetPrice + markupAmount) * 100) / 100

  return {
    supplierNetPrice,
    supplierCurrency: currency,
    markupAmount,
    markupPercent,
    sellingPrice,
    targetCurrency: currency,
  }
}

/** Strip supplierNetPrice from any object before sending to public API */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripSupplierCost<T extends Record<string, any>>(obj: T): Omit<T, 'supplierNetPrice'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { supplierNetPrice: _stripped, ...safe } = obj
  return safe as Omit<T, 'supplierNetPrice'>
}
