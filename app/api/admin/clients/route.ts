import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  // Group bookings by email to get unique clients
  const grouped = await prisma.booking.groupBy({
    by: ['contactEmail'],
    where: search
      ? { contactEmail: { contains: search, mode: 'insensitive' } }
      : undefined,
    _count: { _all: true },
    _sum: { totalAmount: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.booking.groupBy({
    by: ['contactEmail'],
    where: search
      ? { contactEmail: { contains: search, mode: 'insensitive' } }
      : undefined,
  })

  // Fetch phone for each client (from most recent booking)
  const clientsWithPhone = await Promise.all(
    grouped.map(async (g) => {
      const latest = await prisma.booking.findFirst({
        where: { contactEmail: g.contactEmail },
        orderBy: { createdAt: 'desc' },
        select: { contactPhone: true },
      })
      return {
        email: g.contactEmail,
        phone: latest?.contactPhone ?? null,
        totalBookings: g._count._all,
        totalSpent: g._sum.totalAmount ?? 0,
        lastBooking: g._max.createdAt,
      }
    })
  )

  return NextResponse.json({ clients: clientsWithPhone, total: total.length, page, limit })
}
