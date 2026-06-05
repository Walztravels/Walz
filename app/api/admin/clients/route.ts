import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = 25

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { name:  { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { bookings: true } },
        portalApplications: {
          orderBy: { createdAt: 'desc' },
          include: {
            documents: { select: { id: true, status: true } },
            payments:  { select: { id: true, amount: true, status: true } },
            checklist: { select: { id: true, completedAt: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ clients: users, total, page, limit })
}
