/** Display symbols for all supported billing currencies.
 *  Falls back to the ISO code so unknown currencies render legibly, never silently as '₦' or '£'. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  CAD: 'CA$',
  EUR: '€',
  NGN: '₦',
  GHS: 'GH₵',
  AED: 'AED ',
  ZAR: 'R',
}

export function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return ''
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase()
}

// Stripe stores amounts in each currency's smallest unit (minor units).
// The exponent varies: JPY=0, USD/GBP/EUR/CAD/AED/NGN=2, KWD/BHD=3.
// Never blindly divide by 100 — use these helpers everywhere.

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw',
  'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
])

const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd'])

export function getCurrencyExponent(currency: string): number {
  const c = currency.toLowerCase()
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3
  return 2
}

/** Convert a decimal amount (e.g. 8500.00) to Stripe minor units (e.g. 850000). */
export function decimalToMinor(amount: number, currency: string): number {
  return Math.round(amount * Math.pow(10, getCurrencyExponent(currency)))
}

/** Convert Stripe minor units (e.g. 850000) to a decimal value (e.g. 8500.00). */
export function minorToDecimal(amountMinor: number | bigint, currency: string): number {
  const n = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor
  return n / Math.pow(10, getCurrencyExponent(currency))
}

/** Format Stripe minor units as a display currency string. */
export function formatCurrencyMinor(amountMinor: number | bigint, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style:    'currency',
    currency: currency.toUpperCase(),
  }).format(minorToDecimal(amountMinor, currency))
}

/**
 * Canonical Paystack minor→major conversion (kobo → NGN, pesewas → GHS, …).
 *
 * Paystack webhooks and API responses always carry `amount` in the
 * currency's minor unit. Business-domain fields in our database
 * (deposit_amount_paid, PaymentLink.amount, CommercialEvent amounts, …)
 * are MAJOR units. Every Paystack amount read must pass through this
 * helper — never a bare `/ 100`, and never stored raw.
 */
export function paystackMinorToMajor(amountMinor: number | string | null | undefined, currency = 'NGN'): number {
  const n = typeof amountMinor === 'string' ? Number(amountMinor) : (amountMinor ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / Math.pow(10, getCurrencyExponent(currency))
}

/** Canonical Paystack major→minor conversion (NGN → kobo …) for charge creation. */
export function paystackMajorToMinor(amountMajor: number, currency = 'NGN'): number {
  return Math.round(amountMajor * Math.pow(10, getCurrencyExponent(currency)))
}
