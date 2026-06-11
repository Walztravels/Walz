'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { CURRENCIES } from '@/lib/currencies'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurrencyContextType {
  selectedCurrency:    string
  setSelectedCurrency: (code: string) => void
  rates:               Record<string, number>
  convert:             (amount: number, from?: string) => number
  format:              (amount: number, currencyCode?: string) => string
  loading:             boolean
  lastUpdated:         string
}

const CurrencyContext = createContext<CurrencyContextType | null>(null)

const LS_KEY = 'walz_preferred_currency'

// ── Provider ──────────────────────────────────────────────────────────────────

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState('USD')
  const [rates,       setRates]       = useState<Record<string, number>>({})
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')

  // Restore preference from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved && CURRENCIES.some(c => c.code === saved)) {
        setSelectedCurrencyState(saved)
      }
    } catch { /* private browsing */ }
  }, [])

  // Fetch rates once on mount (USD base covers all conversions)
  useEffect(() => {
    fetch('/api/currency?base=USD')
      .then(r => r.json())
      .then(data => {
        if (data.rates) {
          setRates(data.rates)
          setLastUpdated(data.lastUpdated ?? '')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const setSelectedCurrency = useCallback((code: string) => {
    setSelectedCurrencyState(code)
    try { localStorage.setItem(LS_KEY, code) } catch { /* private browsing */ }
  }, [])

  /**
   * Convert `amount` (priced in `from` currency) → selected currency.
   * All rates are relative to USD so: amount_usd / rates[from] * rates[to]
   */
  const convert = useCallback((amount: number, from = 'USD'): number => {
    if (!rates || Object.keys(rates).length === 0) return amount
    const fromRate = rates[from] ?? 1
    const toRate   = rates[selectedCurrency] ?? 1
    return (amount / fromRate) * toRate
  }, [rates, selectedCurrency])

  /**
   * Format a number in `currencyCode` (defaults to selectedCurrency).
   * Uses the currency symbol from CURRENCIES list.
   */
  const format = useCallback((amount: number, currencyCode?: string): string => {
    const code     = currencyCode ?? selectedCurrency
    const currency = CURRENCIES.find(c => c.code === code)
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
    return `${currency?.symbol ?? code} ${formatted}`
  }, [selectedCurrency])

  return (
    <CurrencyContext.Provider value={{
      selectedCurrency,
      setSelectedCurrency,
      rates,
      convert,
      format,
      loading,
      lastUpdated,
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within <CurrencyProvider>')
  return ctx
}
