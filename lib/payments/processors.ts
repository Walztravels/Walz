export interface Processor {
  id:            'paystack' | 'flutterwave' | 'stripe' | 'nowpayments'
  label:         string
  blurb:         string
  currencies:    string[]       // '*' = all
  maxAmount:     number | null  // null = no cap
  maxByCurrency?: Record<string, number>
  enabled:       boolean
}

// IMPORTANT: currency lists are configured per our account capabilities.
// Verify against live dashboards before adding a currency — supported currencies
// are account-level, not provider-level, and may be narrower than marketing claims.
//
// Paystack:     https://dashboard.paystack.com/#/settings/business-details
// Flutterwave:  https://app.flutterwave.com/dashboard/overview
// Stripe:       https://dashboard.stripe.com/settings/account
//
// maxAmount is null for all processors — Flutterwave's limit increase is pending.
// Set a per-currency cap here (no deploy needed) once confirmed, e.g.:
//   maxByCurrency: { NGN: 1_000_000 }
export const PROCESSORS: Processor[] = [
  {
    id: 'paystack', label: 'Paystack',
    blurb: 'Card, bank transfer, USSD',
    currencies: ['NGN', 'GHS', 'KES', 'ZAR'],
    maxAmount: null, enabled: true,
  },
  {
    id: 'flutterwave', label: 'Flutterwave',
    blurb: 'Card, bank transfer',
    currencies: ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'XAF', 'XOF', 'RWF', 'USD', 'GBP', 'EUR'],
    maxAmount: null, enabled: true,
  },
  {
    id: 'stripe', label: 'Stripe',
    blurb: 'Card, Apple Pay, Google Pay',
    currencies: ['GBP', 'USD', 'CAD', 'EUR', 'AED'],
    maxAmount: null, enabled: true,
  },
  {
    id: 'nowpayments', label: 'Cryptocurrency',
    blurb: 'USDT, BTC and others',
    currencies: ['*'],
    maxAmount: null, enabled: true,
  },
]

function isOverCap(p: Processor, currency: string, amount: number): boolean {
  if (p.maxAmount !== null && amount > p.maxAmount) return true
  const byCurrency = p.maxByCurrency
  if (byCurrency && byCurrency[currency] !== undefined && amount > byCurrency[currency]) return true
  return false
}

export function processorsFor(currency: string, amount: number): Processor[] {
  return PROCESSORS.filter(p =>
    p.enabled &&
    (p.currencies.includes('*') || p.currencies.includes(currency)) &&
    !isOverCap(p, currency, amount)
  )
}
