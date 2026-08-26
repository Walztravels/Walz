// lib/pricing/proposal-pricing.ts
// Canonical proposal-level pricing calculation.
// All amounts are in minor units (pence / cents).

export interface ProposalPricingInput {
  subtotalMinor:      bigint   // sum of QuoteItem sellingPriceMinor
  markupMinor:        bigint   // proposal-level additional markup
  serviceChargeMinor: bigint   // fixed service charge
  discountMinor:      bigint   // discount (subtracted)
}

export interface ProposalPricingResult {
  subtotalMinor:      bigint
  markupMinor:        bigint
  serviceChargeMinor: bigint
  discountMinor:      bigint
  totalMinor:         bigint
}

export function calculateProposalPricing(input: ProposalPricingInput): ProposalPricingResult {
  const { subtotalMinor, markupMinor, serviceChargeMinor, discountMinor } = input
  const totalMinor = subtotalMinor + markupMinor + serviceChargeMinor - discountMinor
  return {
    subtotalMinor,
    markupMinor,
    serviceChargeMinor,
    discountMinor,
    totalMinor: totalMinor < BigInt(0) ? BigInt(0) : totalMinor,
  }
}
