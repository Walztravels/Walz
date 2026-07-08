import { NextResponse }       from 'next/server'
import { getServerSession }  from 'next-auth'
import { authOptions }       from '@/lib/auth'
import { prisma }            from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TIER_THRESHOLDS = [
  { tier: 'bronze',   min: 0,     multiplier: 1    },
  { tier: 'silver',   min: 5000,  multiplier: 1.25 },
  { tier: 'gold',     min: 20000, multiplier: 1.5  },
  { tier: 'platinum', min: 50000, multiplier: 2    },
] as const

function resolveTier(lifetimeMiles: number) {
  let current: typeof TIER_THRESHOLDS[number] = TIER_THRESHOLDS[0]
  for (const t of TIER_THRESHOLDS) {
    if (lifetimeMiles >= t.min) current = t
  }
  const nextIdx  = TIER_THRESHOLDS.findIndex(t => t.tier === current.tier) + 1
  const next     = TIER_THRESHOLDS[nextIdx] ?? null
  return {
    tier:         current.tier as 'bronze' | 'silver' | 'gold' | 'platinum',
    multiplier:   current.multiplier,
    nextTier:     (next?.tier ?? null) as 'silver' | 'gold' | 'platinum' | null,
    milesNextTier: next ? next.min - lifetimeMiles : 0,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ enrolled: false, isGuest: true })
  }

  const membership = await prisma.walzRewardsMembership.findUnique({
    where: { userId: session.user.id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  })

  if (!membership) {
    return NextResponse.json({ enrolled: false, isGuest: false })
  }

  const tierInfo = resolveTier(membership.lifetimeMiles)

  return NextResponse.json({
    enrolled:     true,
    isGuest:      false,
    miles:        membership.milesBalance,
    tier:         tierInfo.tier,
    nextTier:     tierInfo.nextTier,
    milesNextTier: tierInfo.milesNextTier,
    multiplier:   tierInfo.multiplier,
    lifetimeMiles: membership.lifetimeMiles,
    joinedAt:     membership.joinedAt,
    recentActivity: membership.transactions.map(t => ({
      date:        t.createdAt,
      description: t.description ?? t.type,
      miles:       t.miles,
    })),
  })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const existing = await prisma.walzRewardsMembership.findUnique({
    where: { userId: session.user.id },
  })

  if (existing) {
    return NextResponse.json({ alreadyEnrolled: true, tier: existing.tier, miles: existing.milesBalance })
  }

  const membership = await prisma.walzRewardsMembership.create({
    data: {
      userId:        session.user.id,
      tier:          'bronze',
      milesBalance:  0,
      lifetimeMiles: 0,
    },
  })

  return NextResponse.json({
    enrolled: true,
    tier:     membership.tier,
    miles:    membership.milesBalance,
    joinedAt: membership.joinedAt,
  })
}
