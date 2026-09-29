import { NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum'
const TIERS: { tier: Tier; threshold: number; multiplier: number }[] = [
  { tier: 'bronze',   threshold: 0,     multiplier: 1    },
  { tier: 'silver',   threshold: 5000,  multiplier: 1.25 },
  { tier: 'gold',     threshold: 20000, multiplier: 1.5  },
  { tier: 'platinum', threshold: 50000, multiplier: 2    },
]

function getTier(miles: number) {
  let current = TIERS[0]
  for (const t of TIERS) {
    if (miles >= t.threshold) current = t
  }
  const nextIdx = TIERS.findIndex(t => t.tier === current.tier) + 1
  const next    = TIERS[nextIdx] ?? null
  return {
    tier:         current.tier,
    multiplier:   current.multiplier,
    nextTier:     next?.tier ?? null,
    milesNextTier: next ? next.threshold - miles : 0,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (session?.user?.id) {
    const membership = await prisma.walzRewardsMembership.findUnique({
      where: { userId: session.user.id },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    })

    if (membership) {
      const { tier, multiplier, nextTier, milesNextTier } = getTier(membership.lifetimeMiles)
      return NextResponse.json({
        account: {
          isGuest:      false,
          enrolled:     true,
          miles:        membership.milesBalance,
          tier,
          nextTier,
          milesNextTier,
          multiplier,
          recentActivity: membership.transactions.map(t => ({
            date:        t.createdAt,
            description: t.description ?? t.type,
            miles:       t.miles,
          })),
        },
      })
    }

    // Logged in but not yet enrolled
    return NextResponse.json({
      account: {
        isGuest:      false,
        enrolled:     false,
        miles:        0,
        tier:         'bronze' as Tier,
        nextTier:     'silver' as Tier,
        milesNextTier: 5000,
        multiplier:   1,
        recentActivity: [],
      },
    })
  }

  // Guest
  return NextResponse.json({
    account: {
      isGuest:      true,
      enrolled:     false,
      miles:        0,
      tier:         'bronze' as Tier,
      nextTier:     'silver' as Tier,
      milesNextTier: 5000,
      multiplier:   1,
      recentActivity: [],
    },
  })
}

// POST handler removed — My Walz Phase 1 cleanup (see commit 58b228af,
// "fix(payments): freeze Walz Miles redemption against flight fares", which
// flagged this stub for removal during this exact mission).
//
// Independently reconfirmed dead before removal:
//   - No caller anywhere in the codebase ever POSTs to this route (grepped
//     for '/api/flights/loyalty' — the only consumer is
//     components/flights/loyalty/LoyaltyDashboard.tsx's GET-only
//     `refreshAccount`, and register/login pages POST to
//     /api/rewards/membership, a different route).
//   - It never touched the database — 'earn' computed a number and returned
//     it without writing a WalzMilesTransaction (the real EARN path is
//     booking-confirmation-triggered in app/api/admin/bookings/[id]/route.ts),
//     and 'redeem' computed a fake discount with a hardcoded "100 miles = £1"
//     conversion and never decremented anything.
//   - It had no auth check and could be called by anyone, authenticated or not.
// Removing it also removes the one remaining piece of code in this repo that
// stated a Miles-to-currency conversion value, which My Walz Phase 1's policy
// forbids everywhere. Do not reintroduce a POST handler here without a real
// server-authoritative ledger write and an explicit product decision.
