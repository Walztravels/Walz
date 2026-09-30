/**
 * Jade Travel Club Release 2A — service-fee discount tests.
 * Covers: integer minor-unit arithmetic, the zero-discount boundary, 0%/100%
 * boundary percentages (fixtures only — never hardcoded application
 * constants), the rounding decision (ROUNDING_MODE, Math.round), an
 * expired membership returning null, a FREE-tier membership (no terms row
 * at all) returning null, and confirming no function here ever queries
 * current policy/catalog config after a terms row exists.
 */

const mockPrisma = {
  jadeClubMembershipTerms: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { resolveServiceFeeDiscount, applyServiceFeeDiscount, ROUNDING_MODE } from '../service-fee-discount'

beforeEach(() => jest.clearAllMocks())

describe('resolveServiceFeeDiscount', () => {
  it('returns null for a FREE-tier membership (no JadeClubMembershipTerms row at all)', async () => {
    mockPrisma.jadeClubMembershipTerms.findFirst.mockResolvedValue(null)
    const result = await resolveServiceFeeDiscount('mem_free')
    expect(result).toBeNull()
  })

  it('returns null for an EXPIRED terms period', async () => {
    // The query itself filters expiresAt > now, so an expired row simply
    // never matches — simulate that by resolving null (as Prisma would).
    mockPrisma.jadeClubMembershipTerms.findFirst.mockResolvedValue(null)
    const result = await resolveServiceFeeDiscount('mem_expired')
    expect(result).toBeNull()
    const call = mockPrisma.jadeClubMembershipTerms.findFirst.mock.calls[0][0]
    expect(call.where.expiresAt.gt).toBeInstanceOf(Date)
  })

  it('returns the discountPercent + membershipTermsId for a current unexpired terms row', async () => {
    mockPrisma.jadeClubMembershipTerms.findFirst.mockResolvedValue({ id: 'terms_1', serviceFeeDiscountPercent: 20 })
    const result = await resolveServiceFeeDiscount('mem_1')
    expect(result).toEqual({ discountPercent: 20, membershipTermsId: 'terms_1' })
  })

  it('orders by activatedAt desc to pick the CURRENT terms period, never an older one', async () => {
    mockPrisma.jadeClubMembershipTerms.findFirst.mockResolvedValue({ id: 'terms_2', serviceFeeDiscountPercent: 40 })
    await resolveServiceFeeDiscount('mem_1')
    const call = mockPrisma.jadeClubMembershipTerms.findFirst.mock.calls[0][0]
    expect(call.orderBy).toEqual({ activatedAt: 'desc' })
  })

  it('NEVER queries JadeClubCommercialPolicy or JadeClubPolicyBenefit for this calculation', () => {
    // Source-level guardrail: this file must not reference either model at all.
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'service-fee-discount.ts'), 'utf8')
    expect(src).not.toMatch(/prisma\.jadeClubCommercialPolicy/)
    expect(src).not.toMatch(/prisma\.jadeClubPolicyBenefit/)
  })
})

describe('applyServiceFeeDiscount — pure function, integer minor-unit arithmetic', () => {
  it('is a pure function: never touches prisma', () => {
    expect(mockPrisma.jadeClubMembershipTerms.findFirst).not.toHaveBeenCalled()
    applyServiceFeeDiscount(10000, { discountPercent: 20, membershipTermsId: 'terms_1' })
    expect(mockPrisma.jadeClubMembershipTerms.findFirst).not.toHaveBeenCalled()
  })

  it('zero-discount boundary: 0% yields zero discount and an unchanged fee', () => {
    const result = applyServiceFeeDiscount(10000, { discountPercent: 0, membershipTermsId: 'terms_1' })
    expect(result).toEqual({
      baseServiceFeeMinor: 10000, discountPercent: 0, discountAmountMinor: 0,
      finalServiceFeeMinor: 10000, membershipTermsId: 'terms_1',
    })
  })

  it('100% boundary (test fixture only — never a hardcoded application constant) fully waives the fee', () => {
    const result = applyServiceFeeDiscount(10000, { discountPercent: 100, membershipTermsId: 'terms_1' })
    expect(result.discountAmountMinor).toBe(10000)
    expect(result.finalServiceFeeMinor).toBe(0)
  })

  it('20% test fixture (used only as a test value, never hardcoded in application code)', () => {
    const result = applyServiceFeeDiscount(10000, { discountPercent: 20, membershipTermsId: 'terms_1' })
    expect(result.discountAmountMinor).toBe(2000)
    expect(result.finalServiceFeeMinor).toBe(8000)
  })

  it('40% test fixture (used only as a test value, never hardcoded in application code)', () => {
    const result = applyServiceFeeDiscount(10000, { discountPercent: 40, membershipTermsId: 'terms_1' })
    expect(result.discountAmountMinor).toBe(4000)
    expect(result.finalServiceFeeMinor).toBe(6000)
  })

  it('applies the ROUNDING_MODE (Math.round / nearest) exactly, not silently ceiling or flooring', () => {
    // 333 minor units * 20% = 66.6 -> rounds to 67 under Math.round.
    const result = applyServiceFeeDiscount(333, { discountPercent: 20, membershipTermsId: 'terms_1' })
    expect(result.discountAmountMinor).toBe(67)
    expect(result.finalServiceFeeMinor).toBe(266)
    expect(ROUNDING_MODE).toBe('ROUND_HALF_TO_EVEN_VIA_MATH_ROUND')
  })

  it('rounds a .5 case the way Math.round does (round half up for positive numbers) — an explicit, documented, isolated decision', () => {
    // 25 * 50% = 12.5 -> Math.round(12.5) = 13
    const result = applyServiceFeeDiscount(25, { discountPercent: 50, membershipTermsId: 'terms_1' })
    expect(result.discountAmountMinor).toBe(13)
  })

  it('discountAmountMinor + finalServiceFeeMinor always sums back to baseServiceFeeMinor', () => {
    for (const base of [0, 1, 99, 100, 1234, 999999]) {
      for (const pct of [0, 1, 15, 20, 40, 50, 99, 100]) {
        const result = applyServiceFeeDiscount(base, { discountPercent: pct, membershipTermsId: 't' })
        expect(result.discountAmountMinor + result.finalServiceFeeMinor).toBe(base)
      }
    }
  })

  it('rejects a non-integer baseServiceFeeMinor', () => {
    expect(() => applyServiceFeeDiscount(100.5, { discountPercent: 20, membershipTermsId: 't' })).toThrow(/non-negative integer/)
  })

  it('rejects a negative baseServiceFeeMinor', () => {
    expect(() => applyServiceFeeDiscount(-1, { discountPercent: 20, membershipTermsId: 't' })).toThrow(/non-negative integer/)
  })

  it('rejects an out-of-range discountPercent', () => {
    expect(() => applyServiceFeeDiscount(100, { discountPercent: 101, membershipTermsId: 't' })).toThrow(/discountPercent/)
    expect(() => applyServiceFeeDiscount(100, { discountPercent: -1, membershipTermsId: 't' })).toThrow(/discountPercent/)
  })

  it('handles a zero base fee', () => {
    const result = applyServiceFeeDiscount(0, { discountPercent: 50, membershipTermsId: 't' })
    expect(result).toEqual({ baseServiceFeeMinor: 0, discountPercent: 50, discountAmountMinor: 0, finalServiceFeeMinor: 0, membershipTermsId: 't' })
  })
})
