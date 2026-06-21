'use client'

import { useCurrency } from '@/lib/context/CurrencyContext'
import { CURRENCIES }  from '@/lib/currencies'

/**
 * Returns a `fp(amount, fromCurrency?)` function that converts an amount
 * from the stored price currency (default GBP) to the user's selected
 * display currency and formats it — no page reload needed.
 */
export function useFlightPrice() {
  const { convert, selectedCurrency } = useCurrency()

  return (amount: number, fromCurrency = 'GBP'): string => {
    const converted = convert(amount, fromCurrency)
    const currency  = CURRENCIES.find(c => c.code === selectedCurrency)
    const symbol    = currency?.symbol ?? selectedCurrency
    const formatted = new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(converted))
    return `${symbol}${formatted}`
  }
}
