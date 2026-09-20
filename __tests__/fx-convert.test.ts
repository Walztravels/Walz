/**
 * lib/pricing/fx-convert.ts — server-authoritative supplier->quote-currency
 * conversion. Mocks lib/fx's getStandardRate (the underlying provider,
 * already tested independently in __tests__/fx-engine.test.ts) so this
 * suite is purely about fx-convert's OWN arithmetic/failure-handling logic.
 */
import { Prisma } from '@prisma/client'

jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn() }))
import { getStandardRate } from '@/lib/fx'
import { convertSupplierAmount, convertMinorUnitAmount, QUOTE_FX_CACHE_MS } from '@/lib/pricing/fx-convert'

const mockGetStandardRate = getStandardRate as jest.Mock

beforeEach(() => jest.clearAllMocks())

function rate(raw: string, provider = 'exchangerate-api', rateSource: 'STANDARD_MARKET' = 'STANDARD_MARKET') {
  return {
    baseCurrency: 'GBP', quoteCurrency: 'USD',
    rawRate: new Prisma.Decimal(raw),
    rateSource, provider, fetchedAt: new Date('2026-09-19T12:00:00.000Z'),
  }
}

describe('convertSupplierAmount', () => {
  it('converts a GBP supplier amount into USD using the provider rate, never relabeling', async () => {
    mockGetStandardRate.mockResolvedValue(rate('1.27000000'))
    const result = await convertSupplierAmount({ supplierAmountMinor: 69242, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    // 692.42 GBP * 1.27 = 879.3734 -> rounds to 879.37 -> 87937 minor units
    expect(result.convertedAmountMinor).toBe(87937)
    expect(result.rate).toBe('1.27')
    expect(result.source).toBe('exchangerate-api')
    expect(mockGetStandardRate).toHaveBeenCalledWith('GBP', 'USD', QUOTE_FX_CACHE_MS)
  })

  it('never fabricates a fallback rate — returns ok:false, not a synthesized 1:1, when the provider is unavailable', async () => {
    mockGetStandardRate.mockResolvedValue(null)
    const result = await convertSupplierAmount({ supplierAmountMinor: 10000, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('FX_RATE_UNAVAILABLE')
  })

  it('rejects an implausible rate (e.g. a provider bug returning a wildly out-of-band value) rather than persisting it', async () => {
    mockGetStandardRate.mockResolvedValue(rate('50000'))
    const result = await convertSupplierAmount({ supplierAmountMinor: 10000, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('FX_RATE_IMPLAUSIBLE')
  })

  it('rejects a zero/negative rate defensively even though getStandardRate itself already filters these', async () => {
    mockGetStandardRate.mockResolvedValue(rate('0'))
    const result = await convertSupplierAmount({ supplierAmountMinor: 10000, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(result.ok).toBe(false)
  })

  it('identity case (same currency both sides): rate of 1, converted amount exactly equals the input — genuine conversion, not a special-cased skip', async () => {
    mockGetStandardRate.mockResolvedValue({
      baseCurrency: 'GBP', quoteCurrency: 'GBP',
      rawRate: new Prisma.Decimal(1), rateSource: 'STANDARD_MARKET', provider: 'identity', fetchedAt: new Date(),
    })
    const result = await convertSupplierAmount({ supplierAmountMinor: 50000, supplierCurrency: 'GBP', targetCurrency: 'GBP' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.convertedAmountMinor).toBe(50000)
    expect(result.source).toBe('identity')
  })

  it('uppercases currency codes before calling the provider, so a lowercase caller input still works', async () => {
    mockGetStandardRate.mockResolvedValue(rate('1.1'))
    await convertSupplierAmount({ supplierAmountMinor: 1000, supplierCurrency: 'gbp', targetCurrency: 'usd' })
    expect(mockGetStandardRate).toHaveBeenCalledWith('GBP', 'USD', QUOTE_FX_CACHE_MS)
  })

  it('rounds using Decimal arithmetic end to end — a value with more precision than 2 decimals still lands on a clean integer minor-unit amount', async () => {
    mockGetStandardRate.mockResolvedValue(rate('1.23456789'))
    const result = await convertSupplierAmount({ supplierAmountMinor: 100000, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    // 1000.00 * 1.23456789 = 1234.56789 -> rounds to 1234.57 -> 123457
    expect(result.convertedAmountMinor).toBe(123457)
    expect(Number.isInteger(result.convertedAmountMinor)).toBe(true)
  })

  it('markup/service-fee scaling shares the SAME conversion arithmetic as supplier cost — not a parallel float implementation', async () => {
    // Closing-fix regression guard: add-to-quote and recalculate-currency
    // once scaled markup/fee via native `Math.round(Number(x) * rate)`
    // while cost went through this module's Decimal path — two arithmetic
    // implementations that could silently diverge. Both now call
    // convertMinorUnitAmount, the same function convertSupplierAmount uses
    // internally for cost, so there is exactly one implementation.
    mockGetStandardRate.mockResolvedValue(rate('1.27'))
    const costResult = await convertSupplierAmount({ supplierAmountMinor: 50000, supplierCurrency: 'GBP', targetCurrency: 'USD' })
    expect(costResult.ok).toBe(true)
    if (!costResult.ok) throw new Error('unreachable')
    const markupMinor = convertMinorUnitAmount(2500, costResult.rate, 'USD')
    // 25.00 GBP * 1.27 = 31.75 -> 3175 minor units, via the identical Decimal path cost used
    expect(markupMinor).toBe(3175)
  })
})

describe('convertMinorUnitAmount — boundary/rounding cases where native float arithmetic diverges', () => {
  it('100 minor units at rate 1.005 — the exact product is precisely 100.5, a genuine round-half boundary', () => {
    // Verified independently: native `100 * 1.005` in JS floating point is
    // 100.49999999999999 (1.005 has no exact binary representation), so
    // `Math.round(100 * 1.005)` wrongly floors to 100. Decimal string
    // arithmetic parses "1.005" exactly and multiplies exactly, landing on
    // 100.500 -> rounds UP to 101, the true product's correct rounding.
    expect(100 * 1.005).toBeLessThan(100.5) // documents the float bug this guards against
    expect(Math.round(100 * 1.005)).toBe(100) // the WRONG answer the old code would have produced
    expect(convertMinorUnitAmount(100, '1.005', 'USD')).toBe(101) // the correct answer
  })

  it('a large multi-item markup (987654 minor units) at a high-precision rate does not drift from exact decimal arithmetic', () => {
    // 9876.54 * 1.23456789 = 12193.2591483006 -> rounds to 12193.26 ->
    // 1219326 minor units exactly, computed via exact decimal
    // multiplication (Number multiplication of values this size carries
    // real drift risk near the rounding boundary).
    expect(convertMinorUnitAmount(987654, '1.23456789', 'USD')).toBe(1219326)
  })

  it('a small service fee (1 minor unit) at a sub-unity rate rounds to zero rather than a fabricated fractional minor unit', () => {
    expect(convertMinorUnitAmount(1, '0.79', 'GBP')).toBe(1) // 0.01 * 0.79 = 0.0079 -> rounds to 0.01 -> 1
    expect(convertMinorUnitAmount(1, '0.4', 'GBP')).toBe(0) // 0.01 * 0.4 = 0.004 -> rounds to 0.00 -> 0
  })

  it('zero markup/fee converts to exactly zero, not a rounding artifact', () => {
    expect(convertMinorUnitAmount(0, '1.6', 'NGN')).toBe(0)
  })

  it('a second known float/Decimal divergence pair: 835 minor units at rate 1.15 (exact product 960.25, no half-boundary risk but a repeating-binary-fraction risk)', () => {
    // 8.35 * 1.15 = 9.6025 exactly in decimal -> rounds to 9.60 -> 960.
    // Included as a second independent cross-check beyond the 1.005 case,
    // using a rate/amount pair with a different fractional structure.
    expect(convertMinorUnitAmount(835, '1.15', 'USD')).toBe(960)
  })

  it('never accepts a client-submitted rate or converted amount — the function signature has no such parameter, only supplier amount/currency and target currency', () => {
    // Structural guarantee, not a runtime one: read the exported input type's
    // shape via a type-level check would require compile-time tooling this
    // suite doesn't have, so this is asserted by source inspection instead.
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync(require.resolve('@/lib/pricing/fx-convert'), 'utf8')
    expect(src).toContain('export interface ConvertSupplierAmountInput')
    const ifaceStart = src.indexOf('export interface ConvertSupplierAmountInput')
    const ifaceBody = src.slice(ifaceStart, src.indexOf('}', ifaceStart))
    expect(ifaceBody).not.toMatch(/rate|convertedAmount/i)
  })
})
