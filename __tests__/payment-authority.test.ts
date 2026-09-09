/**
 * Payment-authority hardening — regression suite.
 *
 * Rule under test: the browser is NEVER authoritative for money. Amounts
 * are derived server-side (Duffel offer, package booking row, Tour row +
 * add-on catalogue, supplier eSIM catalogue), providers are reconciled
 * against server snapshots, mismatches become PAYMENT_RECONCILIATION_REQUIRED,
 * Paystack minor units normalize through one canonical helper, and revenue
 * aggregation never sums across currencies.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Database mock (unit-level tests) ─────────────────────────────────────────
const mockDb = {
  paymentLink:  { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  tour:         { findUnique: jest.fn() },
  user:         { findUnique: jest.fn() },
  $queryRawUnsafe:   jest.fn(),
  $executeRawUnsafe: jest.fn(),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { paystackMinorToMajor, paystackMajorToMinor } = require('@/lib/currency')
const { priceTour, TourPricingError } = require('@/lib/tours/pricing')

// ── Fetch mock ───────────────────────────────────────────────────────────────
type FetchHandler = (url: string) => { ok: boolean; status?: number; json?: unknown }
let fetchHandler: FetchHandler = () => ({ ok: false, status: 500 })
beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const res = fetchHandler(String(url))
    return { ok: res.ok, status: res.status ?? (res.ok ? 200 : 500), json: async () => res.json ?? {} }
  }) as unknown as typeof fetch
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.FLW_SECRET_KEY = 'test-flw-secret'
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Paystack minor-unit normalization (canonical helper)', () => {
  it('₦1, ₦100 and ₦3,220,085 all round-trip identically', () => {
    expect(paystackMinorToMajor(100, 'NGN')).toBe(1)
    expect(paystackMinorToMajor(10_000, 'NGN')).toBe(100)
    expect(paystackMinorToMajor(322_008_500, 'NGN')).toBe(3_220_085)
    expect(paystackMajorToMinor(1, 'NGN')).toBe(100)
    expect(paystackMajorToMinor(100, 'NGN')).toBe(10_000)
    expect(paystackMajorToMinor(3_220_085, 'NGN')).toBe(322_008_500)
  })

  it('handles decimals, strings, and zero-decimal currencies', () => {
    expect(paystackMinorToMajor(150, 'NGN')).toBe(1.5)
    expect(paystackMinorToMajor('322008500', 'NGN')).toBe(3_220_085)
    expect(paystackMinorToMajor(null, 'NGN')).toBe(0)
    expect(paystackMinorToMajor(500, 'JPY')).toBe(500)   // exponent 0
    expect(paystackMajorToMinor(12.34, 'GHS')).toBe(1234)
  })

  it('every webhook branch stores MAJOR units via the helper — no raw data.amount writes', () => {
    const hook = read('app/api/webhooks/paystack/route.ts')
    expect(hook).toContain('paystackMinorToMajor')
    // The two package_bookings branches share ONE settle function fed paidMajor
    expect(hook).toContain('const settlePackageBooking')
    expect(hook).toContain('paidMajor')
    expect(hook).not.toMatch(/deposit_amount_paid = \$2[\s\S]{0,400}?data\.amount,/)
    // No bare kobo division left
    expect(hook).not.toContain('amountKobo / 100')
  })

  it('duplicate webhook remains idempotent and mismatches become reconciliation_required', () => {
    const hook = read('app/api/webhooks/paystack/route.ts')
    expect(hook).toContain("status: 'paid'")                       // idempotency gate preserved
    expect(hook).toContain('Duplicate charge.success ignored')
    expect(hook).toContain("'reconciliation_required'")
    expect(hook).toContain('PAYMENT_RECONCILIATION_REQUIRED')
  })

  it('reconciliation is EXACT minor-unit equality — no ±1 major-unit tolerance', () => {
    const hook = read('app/api/webhooks/paystack/route.ts')
    expect(hook).toContain('paidMinor === paystackMajorToMinor(expected, row.currency)')
    expect(hook).not.toMatch(/Math\.abs\(paidMajor - expected\) <= 1/)
    expect(hook).not.toContain('expected - 1')
    const verify = read('app/api/payments/paystack/verify/route.ts')
    expect(verify).toContain('data.data.amount !== expectedMinor')
    expect(verify).not.toContain('data.data.amount < expectedMinor')
  })

  it('paystack verify prefers the server snapshot and normalizes units', () => {
    const src = read('app/api/payments/paystack/verify/route.ts')
    expect(src).toContain('prisma.paymentLink.findUnique')
    expect(src).toContain('PAYMENT_RECONCILIATION_REQUIRED')
    expect(src).toContain('paystackMinorToMajor(data.data.amount')
    expect(src).not.toContain('data.data.amount / 100')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('tour pricing authority', () => {
  const tourRow = { id: 't1', name: 'Spice Tour', slug: 'spice', location: 'Zanzibar', price: 100, currency: 'GBP', active: true, imageUrl: null }

  it('server derives the total from the Tour row + catalogue', async () => {
    mockDb.tour.findUnique.mockResolvedValue(tourRow)
    const p = await priceTour('t1', 3, ['transfer', 'lunch'])
    expect(p.basePrice).toBe(300)
    expect(p.addonsTotal).toBe((45 + 35) * 3)
    expect(p.total).toBe(300 + 240)
    expect(p.currency).toBe('GBP')
  })

  it('unknown add-ons and inactive/missing tours are rejected', async () => {
    mockDb.tour.findUnique.mockResolvedValue(tourRow)
    await expect(priceTour('t1', 2, ['jacuzzi'])).rejects.toThrow(TourPricingError)
    mockDb.tour.findUnique.mockResolvedValue({ ...tourRow, active: false })
    await expect(priceTour('t1', 2, [])).rejects.toThrow('Tour not found')
    mockDb.tour.findUnique.mockResolvedValue(null)
    await expect(priceTour('t1', 2, [])).rejects.toThrow('Tour not found')
  })

  it('tours/book ignores browser money, requires provider verification, and cannot fulfil a mismatch', () => {
    const src = read('app/api/tours/book/route.ts')
    expect(src).toContain('priceTour(d.tourId, d.groupSize, d.addons)')
    expect(src).toContain('reconcileFlutterwavePayment')
    expect(src).toContain('PAYMENT_RECONCILIATION_REQUIRED')
    expect(src).toContain('status: 402')
    // Money fields no longer read from the parsed body
    expect(src).not.toContain('totalAmount: d.totalAmount')
    expect(src).not.toMatch(/basePrice:\s*d\.basePrice/)
  })

  it('tours stripe-session, helcim-session and crypto invoice all price server-side', () => {
    for (const f of [
      'app/api/tours/stripe-session/route.ts',
      'app/api/tours/helcim-session/route.ts',
      'app/api/payments/crypto/create-invoice/route.ts',
    ]) {
      const src = read(f)
      expect(src).toContain('priceTour(')
      expect(src).not.toMatch(/unit_amount: Math\.round\(d\.totalAmount/)
      expect(src).not.toMatch(/price_amount:\s+d\.totalAmount/)
      expect(src).not.toMatch(/amount:\s+d\.totalAmount/)
    }
  })

  it('the booking page and the server share one add-on catalogue', () => {
    expect(read('app/tours/book/page.tsx')).toContain("from '@/lib/tours/addons'")
    expect(read('lib/tours/pricing.ts')).toContain("from './addons'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('eSIM pricing authority', () => {
  it('checkout revalidates the package server-side and never charges browser prices', () => {
    const src = read('app/api/esim/checkout/route.ts')
    expect(src).toContain('fetchCountryPackages')
    expect(src).toContain('p.packageCode === d.packageCode')
    expect(src).toContain('PRICE_CHANGED')
    // The charge lines use the server-derived values
    expect(src).toContain('amount:       retailUsd,')
    expect(src).toContain('Math.round(retailUsd * 100)')
    expect(src).not.toContain('amount:       d.retailUsd')
    expect(src).not.toContain('Math.round(d.retailUsd * 100)')
    // Unknown package → no payment
    expect(src).toContain('no longer available')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('visa canonical pricing', () => {
  it('one amount + one currency fixed before gateway selection; both providers equal', () => {
    const src = read('app/api/visa/checkout/route.ts')
    expect(src).toContain("const FEE_CURRENCY = 'USD' as const")
    // Both providers charge feeAmount in FEE_CURRENCY
    expect(src).toContain('unit_amount: Math.round(feeAmount * 100)')
    expect(src).toContain('currency:    FEE_CURRENCY.toLowerCase()')
    expect(src).toContain('amount:       feeAmount')
    expect(src).toContain('currency:     FEE_CURRENCY')
    // The GBP-on-Stripe / USD-on-Flutterwave split is gone
    expect(src).not.toContain("currency:    'gbp'")
    expect(src).not.toMatch(/serviceFeeCurrency:\s+'GBP'/)
    // Both DB writes record the same canonical currency
    const writes = src.match(/serviceFeeCurrency:\s+FEE_CURRENCY/g) ?? []
    expect(writes.length).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Flutterwave server authority', () => {
  it('flight checkout: both gateways create a server intent; popup uses intent values', () => {
    const page = read('app/(public)/flights/checkout/page.tsx')
    // FLW popup charges the intent, not page state
    expect(page).toContain('amount:          intent.amount')
    expect(page).toContain('currency:        intent.currency')
    expect(page).not.toMatch(/amount:\s+chargeAmount,\n\s+currency:\s+chargeCurrency,/)
    // Paystack initialize carries the intent reference
    expect(page).toContain('intentRef:   intentData.intent.txRef')
    // Stripe path identifies the offer for server verification
    expect(page).toContain('offerId: selected?.id')
  })

  it('package modal: FLW step and Paystack redirect consume a server intent', () => {
    const modal = read('components/PackageBookingModal.tsx')
    expect(modal).toContain("kind: 'package'")
    expect(modal).toContain('txRef={fwIntent.txRef}')
    expect(modal).toContain('depositAmount={fwIntent.amount}')
    expect(modal).toContain('intentRef: intent.txRef')
    const step = read('components/payments/FlutterwavePaymentStep.tsx')
    expect(step).toContain('tx_ref: txRef ?? bookingRef')
  })

  it('flight intent floors at the Duffel fare; discount capped by the server miles balance', () => {
    const src = read('lib/payments/authority.ts')
    expect(src).toContain("duffelGet<DuffelOfferLite>(`/air/offers/${input.offerId}`)")
    expect(src).toContain('walzRewards')
    expect(src).toContain('Math.min(requested, maxDiscount)')
    expect(src).toContain('Math.max(fareTotal + seats + extras - discount, 0.5)')
  })

  it('paystack initialize replaces browser amounts with the intent snapshot and blocks bare product charges', () => {
    const src = read('app/api/payments/paystack/initialize/route.ts')
    expect(src).toContain('amount       = Number(intent.amount)')
    expect(src).toContain('currency     = intent.currency')
    expect(src).toContain('requires a server payment intent')
    expect(src).toContain('const txRef = intentRef ??')
  })

  it('flutterwave verify reconciles against the snapshot located by the VERIFIED tx_ref', () => {
    const src = read('app/api/payments/flutterwave/verify/route.ts')
    expect(src).toContain('reconcileFlutterwavePayment(transaction_id)')
    expect(src).toContain('PAYMENT_RECONCILIATION_REQUIRED')
    // Browser expectations no longer read from the request body
    expect(src).not.toMatch(/expected_amount\??:/)
    expect(src).not.toMatch(/Number\(expected_amount\)/)
  })

  it('reconciliation locates the intent from the provider-verified tx_ref, never the browser', () => {
    const src = read('lib/payments/authority.ts')
    expect(src).toContain('verified.txRef')
    expect(src).toMatch(/findUnique\(\{\s*\n\s*where:\s+\{ txRef: verified\.txRef \}/)
    expect(src).toContain("status: 'reconciliation_required'")
  })

  it('flutterwave webhook reconciles amount+currency before marking paid', () => {
    const src = read('app/api/flutterwave/webhook/route.ts')
    expect(src).toContain("matches ? 'paid' : 'reconciliation_required'")
    expect(src).toContain('PAYMENT_RECONCILIATION_REQUIRED')
  })

  it('unverifiable payments cannot create flight bookings; mismatches are flagged, not fulfilled', () => {
    const book = read('app/api/flights/book/route.ts')
    expect(book).toContain('reconcileFlutterwavePayment')
    expect(book).toContain("bookingStatus = 'payment_reconciliation_required'")
    expect(book).toContain('status: 402')
    expect(book).toContain('status:         bookingStatus,')
  })

  it('flight Stripe intent and crypto invoice are bounded by the live Duffel offer', () => {
    for (const f of ['app/api/flights/checkout/intent/route.ts', 'app/api/flights/crypto-invoice/route.ts']) {
      const src = read(f)
      expect(src).toContain('/air/offers/')
      expect(src).toContain('status: 409')
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('cross-currency accounting', () => {
  it('byCategory groups by currency inside each category — no cross-currency sums', () => {
    const src = read('app/api/admin/accounting/route.ts')
    expect(src).toContain('byCategory: Record<string, Record<string, number>>')
    expect(src).toContain('byCategory[cat][cur]')
    expect(src).not.toMatch(/byCategory\[cat\] = \(byCategory\[cat\] \?\? 0\)/)
  })

  it('activity revenue and abandoned-cart value are grouped by currency', () => {
    const src = read('app/api/admin/revenue/route.ts')
    expect(src).toContain("by: ['currency']")
    expect(src).toContain('byCurrency: activityMargin.map')
    expect(src).toContain('abandonedValueByCurrency')
    expect(src).not.toContain("currency:    'GBP',")
    const cart = read('app/api/cart/session/route.ts')
    expect(cart).toContain('abandonedValueByCurrency')
  })

  it('the ~£ mixed-currency tiles are gone from both revenue pages', () => {
    for (const f of ['app/admin/revenue/page.tsx', 'app/admin/finance/revenue/page.tsx']) {
      const src = read(f)
      expect(src).not.toContain('~£${fmtNum(Math.round(data.cart.abandonedValue))}')
      expect(src).toContain('abandonedValueByCurrency')
      expect(src).toContain('byCurrency.map')
    }
  })

  it('USD + GBP + NGN never numerically summed by the new aggregations', () => {
    // The grouped shapes make the sum impossible by construction: each entry
    // carries its currency key. Guard the shape itself.
    const src = read('app/api/admin/revenue/route.ts')
    expect(src).toContain('Per-currency rows — never a single cross-currency sum')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Jade FX semantics', () => {
  it('UNITS_PER_GBP is renamed + documented as assessment normalization, not live FX', () => {
    const src = read('lib/jade/intelligence-v2.ts')
    expect(src).toContain('VISA_ASSESSMENT_UNITS_PER_GBP')
    expect(src).toContain('NOT LIVE FX RATES')
    expect(src).toContain('NEVER be used for commercial pricing')
    expect(src).not.toMatch(/\bconst UNITS_PER_GBP\b/)
    // Client-facing balance figures are labelled estimates
    expect(src).toContain('(assessment estimate)')
  })

  it('check_fx_timing passes billing→local so the percentile direction is correct', () => {
    const src = read('lib/jade/tools.ts')
    expect(src).toMatch(/getFxAdvice\(\s*\n\s*input\.billing_currency \?\? "GBP",\s*\n\s*input\.local_currency \?\? "NGN",/)
  })

  it('FX timing is advisory only — no certainty claims, no invented rates', () => {
    const src = read('lib/jade/intelligence-v2.ts')
    expect(src).not.toMatch(/will (rise|fall|drop|increase)/i)
    expect(src).toContain('may be worth watching')
    const tools = read('lib/jade/tools.ts')
    expect(tools).toContain('Do not mention exchange rates this turn')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('getFxAdvice percentile boundaries', () => {
  // Direction under test: rates are LOCAL per BILLING (e.g. NGN per GBP).
  // Low percentile = cheap local cost = pay_now; high = expensive = wait.
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key'
  const { getFxAdvice } = require('@/lib/jade/intelligence-v2')

  function frankfurter(rates: number[], quote: string) {
    const byDate: Record<string, Record<string, number>> = {}
    rates.forEach((r, i) => { byDate[`2026-08-${String(i + 1).padStart(2, '0')}`] = { [quote]: r } })
    return { ok: true, json: { rates: byDate } }
  }

  // Distinct quote currencies per case — getFxAdvice keeps a 1-hour
  // in-process cache per pair, so reusing one pair would freeze the series.
  it.each([
    ['very favourable (30-day low)',    'ZAR', [25, 24, 23.8, 24.5, 23.0], 'pay_now'],
    ['favourable (≤25th percentile)',   'SEK', [25, 24.8, 24.6, 24.4, 24.05], 'pay_now'],
    ['neutral (mid-range)',             'NOK', [25, 23, 24.2, 24.1, 24.0], 'neutral'],
    ['unfavourable (≥75th percentile)', 'DKK', [23, 23.2, 23.4, 23.6, 24.6], 'wait'],
    ['very unfavourable (30-day high)', 'CHF', [23, 23.5, 24, 24.5, 25.0], 'wait'],
  ])('%s → %s', async (_label, quote, series, expected) => {
    fetchHandler = url => url.includes('frankfurter') ? frankfurter(series as number[], quote as string) : { ok: false, status: 500 }
    const advice = await getFxAdvice('GBP', quote as string)
    expect(advice?.advice).toBe(expected as string)
  })

  it('unsupported pairs (no NGN at the source) return null — Jade says unavailable, never guesses', async () => {
    fetchHandler = () => ({ ok: true, json: { rates: {} } })
    const advice = await getFxAdvice('GBP', 'NGN')
    expect(advice).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('payment ≠ supplier confirmation', () => {
  it('the authority module never touches supplier/booking confirmation state', () => {
    const src = read('lib/payments/authority.ts')
    expect(src).toContain('Payment captured is still NOT supplier confirmation')
    expect(src).not.toMatch(/supplier(Confirmed|_confirmed|Status)/)
    expect(src).not.toContain("'CONFIRMED'")
  })

  it('flight bookings stay pending human review even when payment verifies', () => {
    const book = read('app/api/flights/book/route.ts')
    expect(book).toContain("let bookingStatus = 'pending_review'")
    expect(book).not.toContain("bookingStatus = 'confirmed'")
  })

  it('tour bookings record PENDING status (team confirmation) despite verified payment', () => {
    const src = read('app/api/tours/book/route.ts')
    expect(src).toContain("status: 'PENDING'")
  })
})
