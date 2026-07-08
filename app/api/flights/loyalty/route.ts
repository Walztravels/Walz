import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json()
    const action = body.action as string

    if (action === 'earn') {
      const amountGBP  = Number(body.amountGBP ?? 0)
      const bookingRef = String(body.bookingRef ?? '')
      const baseMiles  = Math.round(amountGBP * 10)
      return NextResponse.json({ earned: baseMiles, bookingRef, message: `+${baseMiles} miles earned on booking ${bookingRef}` })
    }

    if (action === 'redeem') {
      const milesRequired = Number(body.milesRequired ?? 0)
      const discountGBP   = Math.floor(milesRequired / 100)
      return NextResponse.json({ redeemed: milesRequired, discountGBP })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[loyalty] Error:', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
