// app/api/admin/jade-club/overview/route.ts — Admin Jade Club Control Centre summary.
//
// Every figure here is a real COUNT query — nothing is invented. Revenue is
// deliberately NOT computed or shown: Phase 1 has no paid purchase flow, so
// there is no real revenue figure to report (fabricating one is explicitly
// forbidden by the brief).

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [totalUsers, tierCounts, statusCounts, physicalCardCounts, benefitCount] = await Promise.all([
    prisma.user.count(),
    prisma.jadeClubMembership.groupBy({ by: ['tier'], _count: { _all: true } }),
    prisma.jadeClubMembership.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.jadePhysicalCard.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.jadeClubBenefit.count({ where: { active: true } }),
  ])

  const membershipRowCount = tierCounts.reduce((sum, t) => sum + t._count._all, 0)
  // Jade Free customers = every user MINUS those with an explicit
  // membership row that is NOT tier FREE (a FREE-tier row, or no row at
  // all, both count as Jade Free — see membership.ts header for why rows
  // aren't bulk-created).
  const nonFreeRows = tierCounts.filter(t => t.tier !== 'FREE').reduce((sum, t) => sum + t._count._all, 0)
  const jadeFreeCount = totalUsers - nonFreeRows

  return NextResponse.json({
    jadeFreeCount,
    clubCount: tierCounts.find(t => t.tier === 'CLUB')?._count._all ?? 0,
    clubPlusCount: tierCounts.find(t => t.tier === 'CLUB_PLUS')?._count._all ?? 0,
    activeCount: statusCounts.find(s => s.status === 'ACTIVE')?._count._all ?? 0,
    expiringCount: statusCounts.find(s => s.status === 'EXPIRING')?._count._all ?? 0,
    expiredCount: statusCounts.find(s => s.status === 'EXPIRED')?._count._all ?? 0,
    cancelledCount: statusCounts.find(s => s.status === 'CANCELLED')?._count._all ?? 0,
    physicalCardsRequested: physicalCardCounts.find(p => p.status === 'REQUESTED')?._count._all ?? 0,
    physicalCardsInFulfilment: physicalCardCounts
      .filter(p => ['APPROVED', 'PRINTING', 'SHIPPED'].includes(p.status))
      .reduce((sum, p) => sum + p._count._all, 0),
    activeBenefitsCount: benefitCount,
    membershipRowCount,
    // Paid membership is not live in Phase 1 — never fabricate a revenue figure.
    revenue: null,
  })
}
