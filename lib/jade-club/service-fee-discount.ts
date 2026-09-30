// lib/jade-club/service-fee-discount.ts — Jade Travel Club Release 2A:
// service-fee discount resolution + calculation.
//
// ZERO LIVE WIRING in this release. Nothing in this file is called by any
// existing Quote/Booking/Visa/Flight/Hotel pricing route — that wiring is
// explicitly deferred to a later release. This file only:
//   1. resolveServiceFeeDiscount — reads a member's CURRENT unexpired
//      JadeClubMembershipTerms row (never the live policy/catalog).
//   2. applyServiceFeeDiscount — a pure function, zero DB access, fully
//      unit-testable, that turns a discount % into minor-unit amounts.
// A caller elsewhere in the app would, in a future release, pass the
// result of #1 into #2 and write a JadeClubServiceFeeDiscountApplication
// row — none of that happens here.
//
// ── Rounding convention (investigated, not invented) ─────────────────────
// Before writing applyServiceFeeDiscount, this repo's existing minor-unit
// money rounding was inspected:
//   - lib/currency.ts (toMinorUnits):        Math.round(amount * 10^exp)
//   - lib/pricing/booking-price.ts:          Math.round(n * 100) / 100
//   - lib/payment-fees.ts (card fees):       Math.ceil(... * 100) / 100
// These are TWO DIFFERENT, INCOMPATIBLE conventions for two different
// purposes: general currency/amount conversion rounds to nearest
// (Math.round), while payment-fees.ts deliberately rounds UP for card
// processing cost recovery (Math.ceil), which is the opposite intent of a
// discount (which should not silently inflate what the customer owes).
// Per the implementation brief, since there is no SINGLE authoritative
// convention covering "rounding a discount amount off a service fee",
// ROUNDING_MODE is kept below as an explicit, isolated, named constant
// (currently 'ROUND_HALF_TO_EVEN_VIA_MATH_ROUND', i.e. Math.round — the
// more common of the two general-purpose conventions found, and the one
// that does not systematically favour either party) rather than silently
// adopting payment-fees.ts's Math.ceil. THIS IS AN OPEN DECISION — flagged
// explicitly in the implementation report; change ROUNDING_MODE's
// implementation below if the business decides otherwise.

import prisma from '@/lib/db'

/** Explicit, isolated, easily-locatable rounding decision — see file header. */
export const ROUNDING_MODE = 'ROUND_HALF_TO_EVEN_VIA_MATH_ROUND' as const

function roundMinor(value: number): number {
  return Math.round(value)
}

export interface ResolvedServiceFeeDiscount {
  discountPercent: number
  membershipTermsId: string
}

/**
 * Reads the member's CURRENT unexpired JadeClubMembershipTerms row (the
 * most recently activated one whose expiresAt is still in the future).
 * Returns null for:
 *   - a Jade Free member with no JadeClubMembership at all
 *   - a CLUB/CLUB_PLUS member who has never had terms activated (no
 *     JadeClubMembershipTerms row exists)
 *   - an EXPIRED terms period (expiresAt in the past)
 * NEVER reads JadeClubCommercialPolicy or JadeClubPolicyBenefit — only the
 * immutable terms row itself.
 */
export async function resolveServiceFeeDiscount(membershipId: string): Promise<ResolvedServiceFeeDiscount | null> {
  const terms = await prisma.jadeClubMembershipTerms.findFirst({
    where: { membershipId, expiresAt: { gt: new Date() } },
    orderBy: { activatedAt: 'desc' },
    select: { id: true, serviceFeeDiscountPercent: true },
  })
  if (!terms) return null
  return { discountPercent: terms.serviceFeeDiscountPercent, membershipTermsId: terms.id }
}

export interface ServiceFeeDiscountCalculation {
  baseServiceFeeMinor: number
  discountPercent: number
  discountAmountMinor: number
  finalServiceFeeMinor: number
  membershipTermsId: string
}

/**
 * Pure function — no DB access. Computes the discount amount and final fee
 * in integer minor units. discountPercent of 0 yields a zero discount
 * (boundary case); 100 yields a fully-waived fee (reachable only if a
 * policy is ever authored with a 100% discount — this function does not
 * forbid it, since serviceFeeDiscountPercent's own valid range,
 * 0–100, is enforced at policy-authoring time in
 * lib/jade-club/commercial-policy.ts).
 */
export function applyServiceFeeDiscount(
  baseServiceFeeMinor: number,
  discount: ResolvedServiceFeeDiscount,
): ServiceFeeDiscountCalculation {
  if (!Number.isInteger(baseServiceFeeMinor) || baseServiceFeeMinor < 0) {
    throw new Error('baseServiceFeeMinor must be a non-negative integer (minor units)')
  }
  if (!Number.isInteger(discount.discountPercent) || discount.discountPercent < 0 || discount.discountPercent > 100) {
    throw new Error('discountPercent must be an integer between 0 and 100')
  }

  const discountAmountMinor = roundMinor((baseServiceFeeMinor * discount.discountPercent) / 100)
  const finalServiceFeeMinor = baseServiceFeeMinor - discountAmountMinor

  return {
    baseServiceFeeMinor,
    discountPercent: discount.discountPercent,
    discountAmountMinor,
    finalServiceFeeMinor,
    membershipTermsId: discount.membershipTermsId,
  }
}
