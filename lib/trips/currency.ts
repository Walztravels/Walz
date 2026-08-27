/**
 * Groups trip item costs by their currency and sums each group.
 * Returns a map of { currency → total } with no cross-currency arithmetic.
 * Items with null cost or zero cost are excluded from the totals.
 */
export function groupTripTotalsByCurrency(
  items: { cost: number | null; currency: string; quantity: number }[]
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const item of items) {
    if (!item.cost) continue
    const key = (item.currency || 'GBP').toUpperCase()
    totals[key] = (totals[key] ?? 0) + item.cost * item.quantity
  }
  return totals
}

/**
 * Returns true if items span more than one currency.
 */
export function isMixedCurrency(
  items: { currency: string }[]
): boolean {
  const currencies = new Set(items.map(i => (i.currency || 'GBP').toUpperCase()))
  return currencies.size > 1
}
