// lib/portal/miles-data.ts — My Walz Phase 1: Walz Miles wallet (read-only).
//
// Reads the EXISTING authoritative Miles ledger (WalzRewardsMembership +
// WalzMilesTransaction — see app/api/admin/bookings/[id]/route.ts for the
// append-only, idempotent EARN path this reads from). This module never
// writes to either table — it is a display-only aggregator for the client
// wallet page and the My Walz home card.
//
// Hard rules encoded here (do not relax without a product-policy change):
//   - No currency/monetary conversion value is ever attached to a Miles figure.
//   - No redemption figures, redemption actions, or redemption eligibility
//     are computed or returned by this module.
//   - "Pending" / "Expiring" are NOT returned because the schema has no
//     columns for either (WalzMilesTransaction has no expiry/pending state) —
//     inventing them would violate the "no fabricated Miles data" rule.
//   - `userId` must come from the authenticated session in the caller —
//     this module trusts whatever userId it is given, so callers MUST pass
//     session.user.id and never a client-supplied id.

import prisma from '@/lib/db'

export type MilesActivityCategory =
  | 'Booking Earn'
  | 'Bonus'
  | 'Adjustment'
  | 'Reversal'
  | 'Expiry'
  | 'Other'

// Maps the real `WalzMilesTransaction.type` column values to a display
// category. Only 'earned' is written anywhere in the codebase today (the
// admin booking-confirmation EARN path) — the rest are included so that if
// an admin tool starts writing bonus/adjustment/reversal/expiry rows in the
// future, this wallet displays them correctly without a code change. Never
// invents a category that isn't derived from the real stored `type` value.
const CATEGORY_BY_TYPE: Record<string, MilesActivityCategory> = {
  earned:     'Booking Earn',
  bonus:      'Bonus',
  adjustment: 'Adjustment',
  reversal:   'Reversal',
  expiry:     'Expiry',
  expired:    'Expiry',
}

export function categorizeMilesTransactionType(type: string): MilesActivityCategory {
  return CATEGORY_BY_TYPE[type] ?? 'Other'
}

export interface MilesActivityRow {
  category:    MilesActivityCategory
  description: string
  miles:       number          // positive = credit, negative = debit (none exist today, kept generic)
  date:        Date
}

export interface MilesWalletData {
  enrolled:      boolean
  milesBalance:  number
  lifetimeMiles: number
  tier:          string
  joinedAt:      Date | null
  activity:      MilesActivityRow[]
}

const EMPTY_WALLET: MilesWalletData = {
  enrolled:      false,
  milesBalance:  0,
  lifetimeMiles: 0,
  tier:          'bronze',
  joinedAt:      null,
  activity:      [],
}

/**
 * Read-only Miles wallet aggregate for one authenticated user.
 *
 * `userId` MUST be `session.user.id` from a verified server session — never
 * a client-supplied id. A client with no WalzRewardsMembership row (i.e. has
 * never earned Miles) is a legitimate, correct "0 Walz Miles" state — this
 * function does NOT create a membership row as a side effect of reading it.
 */
export async function getMilesWalletData(userId: string): Promise<MilesWalletData> {
  const membership = await prisma.walzRewardsMembership.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!membership) return EMPTY_WALLET

  return {
    enrolled:      true,
    milesBalance:  membership.milesBalance,
    lifetimeMiles: membership.lifetimeMiles,
    tier:          membership.tier,
    joinedAt:      membership.joinedAt,
    activity: membership.transactions.map(t => ({
      category:    categorizeMilesTransactionType(t.type),
      description: t.description ?? categorizeMilesTransactionType(t.type),
      miles:       t.miles,
      date:        t.createdAt,
    })),
  }
}
