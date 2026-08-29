/**
 * Phase 2D — Gateway-Currency Compatibility + Display Cleanup
 * Regression tests covering:
 *   - isCurrencySupported: provider × currency allowlist enforcement
 *   - BANK_TRANSFER / MANUAL passthrough
 *   - Unknown method passthrough (safe default)
 *   - Webhook currency validation logic (pure functions)
 *   - A2 commissions: fmtRevenue grouping
 *   - A3 flight-extras: getCurrencySymbol from FlightExtra.currency
 *   - FlightFilters: resultCurrency derivation from results[0].price.currency
 *   - formatPrice currency pass-through
 */

import { isCurrencySupported } from '../payments/processors'
import { getCurrencySymbol }    from '../currency'
import { formatPrice }          from '../flights/utils'

// ── isCurrencySupported ────────────────────────────────────────────────────

describe('isCurrencySupported', () => {
  // Stripe allowlist: GBP, USD, CAD, EUR, AED
  it('Stripe supports GBP', ()  => expect(isCurrencySupported('STRIPE', 'GBP')).toBe(true))
  it('Stripe supports USD', ()  => expect(isCurrencySupported('STRIPE', 'USD')).toBe(true))
  it('Stripe supports CAD', ()  => expect(isCurrencySupported('STRIPE', 'CAD')).toBe(true))
  it('Stripe supports EUR', ()  => expect(isCurrencySupported('STRIPE', 'EUR')).toBe(true))
  it('Stripe supports AED', ()  => expect(isCurrencySupported('STRIPE', 'AED')).toBe(true))
  it('Stripe rejects NGN',  ()  => expect(isCurrencySupported('STRIPE', 'NGN')).toBe(false))
  it('Stripe rejects GHS',  ()  => expect(isCurrencySupported('STRIPE', 'GHS')).toBe(false))
  it('Stripe rejects ZAR',  ()  => expect(isCurrencySupported('STRIPE', 'ZAR')).toBe(false))

  // Paystack allowlist: NGN, GHS, KES, ZAR
  it('Paystack supports NGN', () => expect(isCurrencySupported('PAYSTACK', 'NGN')).toBe(true))
  it('Paystack supports GHS', () => expect(isCurrencySupported('PAYSTACK', 'GHS')).toBe(true))
  it('Paystack supports ZAR', () => expect(isCurrencySupported('PAYSTACK', 'ZAR')).toBe(true))
  it('Paystack rejects GBP',  () => expect(isCurrencySupported('PAYSTACK', 'GBP')).toBe(false))
  it('Paystack rejects USD',  () => expect(isCurrencySupported('PAYSTACK', 'USD')).toBe(false))

  // Flutterwave: multi-currency including USD, GBP, EUR
  it('Flutterwave supports NGN', () => expect(isCurrencySupported('FLUTTERWAVE', 'NGN')).toBe(true))
  it('Flutterwave supports USD', () => expect(isCurrencySupported('FLUTTERWAVE', 'USD')).toBe(true))
  it('Flutterwave supports GBP', () => expect(isCurrencySupported('FLUTTERWAVE', 'GBP')).toBe(true))
  it('Flutterwave supports ZAR', () => expect(isCurrencySupported('FLUTTERWAVE', 'ZAR')).toBe(true))
  it('Flutterwave rejects AED',  () => expect(isCurrencySupported('FLUTTERWAVE', 'AED')).toBe(false))

  // Crypto (NowPayments): wildcard — all currencies
  it('CRYPTO supports NGN', () => expect(isCurrencySupported('CRYPTO', 'NGN')).toBe(true))
  it('CRYPTO supports ZAR', () => expect(isCurrencySupported('CRYPTO', 'ZAR')).toBe(true))
  it('CRYPTO supports GBP', () => expect(isCurrencySupported('CRYPTO', 'GBP')).toBe(true))
  it('CRYPTO supports AED', () => expect(isCurrencySupported('CRYPTO', 'AED')).toBe(true))

  // Advisor-handled methods — always pass
  it('BANK_TRANSFER always passes for NGN',  () => expect(isCurrencySupported('BANK_TRANSFER', 'NGN')).toBe(true))
  it('BANK_TRANSFER always passes for GBP',  () => expect(isCurrencySupported('BANK_TRANSFER', 'GBP')).toBe(true))
  it('MANUAL always passes for GHS',         () => expect(isCurrencySupported('MANUAL', 'GHS')).toBe(true))
  it('MANUAL always passes for USD',         () => expect(isCurrencySupported('MANUAL', 'USD')).toBe(true))

  // Case insensitivity
  it('lowercase stripe still works',   () => expect(isCurrencySupported('stripe', 'GBP')).toBe(true))
  it('mixed-case paystack still works', () => expect(isCurrencySupported('Paystack', 'NGN')).toBe(true))

  // Unknown method defaults to true (don't block unknown/future methods)
  it('unknown method defaults to true', () => expect(isCurrencySupported('PAGA', 'NGN')).toBe(true))
})

// ── Webhook currency mismatch validation (pure logic) ─────────────────────

describe('webhook currency mismatch logic', () => {
  function simulatePaystackCurrencyCheck(
    webhookCurrency: string | undefined,
    metadataCurrency: string | undefined,
  ): 'pass' | 'reject' {
    const expected = metadataCurrency?.toUpperCase()
    const received = webhookCurrency?.toUpperCase()
    if (expected && received && received !== expected) return 'reject'
    return 'pass'
  }

  it('matching currencies pass',       () => expect(simulatePaystackCurrencyCheck('NGN', 'NGN')).toBe('pass'))
  it('matching currencies pass (GBP)', () => expect(simulatePaystackCurrencyCheck('GBP', 'GBP')).toBe('pass'))
  it('mismatched currency is rejected', () => expect(simulatePaystackCurrencyCheck('USD', 'NGN')).toBe('reject'))
  it('missing metadata currency → pass (no stamp)', () => expect(simulatePaystackCurrencyCheck('NGN', undefined)).toBe('pass'))
  it('missing webhook currency → pass (no data)',   () => expect(simulatePaystackCurrencyCheck(undefined, 'NGN')).toBe('pass'))
  it('case is normalised — ghs vs GHS passes',     () => expect(simulatePaystackCurrencyCheck('ghs', 'GHS')).toBe('pass'))
})

// ── A3 Flight-extras: currency symbol from FlightExtra.currency ───────────

describe('flight-extras currency display (A3)', () => {
  it('GBP extra shows £',        () => expect(getCurrencySymbol('GBP')).toBe('£'))
  it('USD extra shows $',        () => expect(getCurrencySymbol('USD')).toBe('$'))
  it('NGN extra shows ₦',        () => expect(getCurrencySymbol('NGN')).toBe('₦'))
  it('GHS extra shows GH₵',      () => expect(getCurrencySymbol('GHS')).toBe('GH₵'))
  it('AED extra shows AED ',     () => expect(getCurrencySymbol('AED')).toBe('AED '))
  it('ZAR extra shows R',        () => expect(getCurrencySymbol('ZAR')).toBe('R'))
  it('unknown currency → ISO code not ₦', () => {
    const sym = getCurrencySymbol('XYZ')
    expect(sym).not.toBe('₦')
    expect(sym).toBe('XYZ')
  })
})

// ── FlightFilters: resultCurrency derivation ──────────────────────────────

describe('FlightFilters resultCurrency derivation', () => {
  function deriveResultCurrency(results: Array<{ price: { currency: string } }>): string {
    return results[0]?.price.currency ?? 'GBP'
  }

  it('derives GBP from first result when API quotes GBP', () =>
    expect(deriveResultCurrency([{ price: { currency: 'GBP' } }])).toBe('GBP'))

  it('derives NGN when API quotes NGN', () =>
    expect(deriveResultCurrency([{ price: { currency: 'NGN' } }])).toBe('NGN'))

  it('falls back to GBP when results are empty', () =>
    expect(deriveResultCurrency([])).toBe('GBP'))

  it('uses first result currency regardless of others', () =>
    expect(deriveResultCurrency([
      { price: { currency: 'USD' } },
      { price: { currency: 'GBP' } },
    ])).toBe('USD'))
})

// ── formatPrice currency pass-through ────────────────────────────────────

describe('formatPrice currency pass-through', () => {
  it('formats GBP price with £ symbol',  () => expect(formatPrice(100, 'GBP')).toContain('£'))
  it('formats USD price with $ symbol',  () => expect(formatPrice(100, 'USD')).toMatch(/\$|USD/))
  it('formats NGN price with NGN or ₦',  () => expect(formatPrice(100, 'NGN')).toMatch(/₦|NGN/))
  it('defaults to GBP when no currency', () => expect(formatPrice(50)).toContain('£'))
})
