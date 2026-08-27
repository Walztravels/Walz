// Recovery priority scoring (Release 3A)
//
// Rules-based — no AI. Centralised here so scoring is consistent across all
// detection paths (abandoned cart, failed payment, supplier failure).

import type { RecoveryType, RecoveryPriority } from './types'

interface ScoringInput {
  type:    RecoveryType
  amount?: number | null
}

// Thresholds in GBP-equivalent (we don't convert — these are rough guides).
// Non-GBP amounts are scored at face value; the priority may be slightly off
// for small currencies (NGN) but that's acceptable at this stage.
const HIGH_AMOUNT   = 1_000
const MEDIUM_AMOUNT = 200

export function calculatePriority({ type, amount }: ScoringInput): RecoveryPriority {
  // Supplier failures are always URGENT — customer money is already held.
  if (type === 'SUPPLIER_FAILURE') return 'URGENT'

  // Failed payments carry urgency relative to amount (intent was strong — they tried to pay).
  if (type === 'FAILED_PAYMENT') {
    if ((amount ?? 0) >= 2_000) return 'HIGH'
    if ((amount ?? 0) >= 500)   return 'MEDIUM'
    return 'LOW'
  }

  // Abandoned carts: scored by value
  if (type === 'ABANDONED_CART') {
    if ((amount ?? 0) >= HIGH_AMOUNT)   return 'HIGH'
    if ((amount ?? 0) >= MEDIUM_AMOUNT) return 'MEDIUM'
    return 'LOW'
  }

  // Incomplete trips: scored by value
  if (type === 'INCOMPLETE_TRIP') {
    if ((amount ?? 0) >= HIGH_AMOUNT)   return 'HIGH'
    if ((amount ?? 0) >= MEDIUM_AMOUNT) return 'MEDIUM'
    return 'LOW'
  }

  // Unpaid proposals: always HIGH — the customer has seen a full price and not paid.
  if (type === 'UNPAID_PROPOSAL') return 'HIGH'

  // Hot lead: MEDIUM default — lead scoring drives priority elsewhere.
  if (type === 'HOT_LEAD') return 'MEDIUM'

  return 'MEDIUM'
}

// Priority sort order for display (URGENT first).
export const PRIORITY_ORDER: Record<RecoveryPriority, number> = {
  URGENT: 0,
  HIGH:   1,
  MEDIUM: 2,
  LOW:    3,
}
