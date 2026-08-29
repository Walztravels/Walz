/**
 * lib/v2/pricing.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Authoritative V2 pricing engine.
 *
 * Formula (spec §Deliverable 3):
 *   replacementAdjustment = SUM of priceAdjustment for all REPLACEMENT items
 *   addOnTotal            = SUM of clientPrice for all ADD_ON items
 *   grandTotal            = MAX(0, baseTotal + replacementAdjustment + addOnTotal)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { PricingInput, PricingResult } from './types'

/**
 * Calculate the full trip price from a base total and a set of selected option
 * items. Returns a PricingResult that can be stored verbatim in
 * AcceptedConfigurationV2.pricingBreakdown.
 */
export function calculateTripPrice(input: PricingInput): PricingResult {
  let replacementAdjustment = 0
  let addOnTotal = 0

  const lineItems: PricingResult['lineItems'] = input.selectedItems.map((item) => {
    if (item.pricingMode === 'REPLACEMENT') {
      replacementAdjustment += item.priceAdjustment
      return {
        itemId:      item.itemId,
        groupId:     item.groupId,
        pricingMode: item.pricingMode,
        amount:      item.priceAdjustment,
        label:       item.label,
      }
    } else {
      // ADD_ON
      addOnTotal += item.clientPrice
      return {
        itemId:      item.itemId,
        groupId:     item.groupId,
        pricingMode: item.pricingMode,
        amount:      item.clientPrice,
        label:       item.label,
      }
    }
  })

  const rawGrandTotal = input.baseTotal + replacementAdjustment + addOnTotal
  // grandTotal is floored at 0 — never negative
  const grandTotal = Math.max(0, rawGrandTotal)

  return {
    baseTotal: input.baseTotal,
    replacementAdjustment,
    addOnTotal,
    grandTotal,
    lineItems,
    currency: input.currency,
  }
}

/**
 * Returns false if any selected item's currency differs from baseCurrency.
 * All amounts in a single pricing calculation must share one currency.
 */
export function validateCurrencies(
  items: PricingInput['selectedItems'],
  baseCurrency: string,
): boolean {
  return items.every((item) => item.currency === baseCurrency)
}
