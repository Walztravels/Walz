// app/api/admin/jade-club/memberships/route.ts — Admin: list/search Jade Club memberships.
//
// View-only route — requires 'jade_club'. Mutations happen only on the
// [userId] sub-route, which requires the stricter 'jade_club.manage'.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const query = (req.nextUrl.searchParams.get('query') ?? '').trim()
  const take = 50

  const rows = await prisma.jadeClubMembership.findMany({
    where: query
      ? {
          user: {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
            ],
          },
        }
      : undefined,
    include: { user: { select: { name: true, email: true } }, physicalCard: { select: { status: true } } },
    orderBy: { updatedAt: 'desc' },
    take,
  })

  return NextResponse.json({
    memberships: rows.map(r => ({
      userId: r.userId,
      memberCode: r.memberCode,
      name: r.user.name,
      email: r.user.email,
      tier: r.tier,
      status: r.status,
      source: r.source,
      startedAt: r.startedAt,
      expiresAt: r.expiresAt,
      physicalCardStatus: r.physicalCard?.status ?? 'NOT_ORDERED',
    })),
  })
}
