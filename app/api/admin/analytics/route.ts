import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [bookings, clients, visaApps, revenue, recentBookings, visaByStatus] = await Promise.all([
    prisma.booking.count(),
    prisma.user.count(),
    prisma.visaApplication.count(),
    prisma.booking.aggregate({ _sum: { totalAmount: true } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.visaApplication.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
  ])

  const byMonth: Record<string, { count: number; revenue: number }> = {}
  recentBookings.forEach(b => {
    const key = b.createdAt.toISOString().slice(0, 7)
    if (!byMonth[key]) byMonth[key] = { count: 0, revenue: 0 }
    byMonth[key].count++
    byMonth[key].revenue += b.totalAmount ?? 0
  })

  return NextResponse.json({
    totalBookings:    bookings,
    totalRevenue:     revenue._sum.totalAmount ?? 0,
    totalClients:     clients,
    totalVisaApps:    visaApps,
    bookingsByMonth:  Object.entries(byMonth).map(([month, v]) => ({ month, ...v })),
    visaByStatus:     visaByStatus.map(v => ({ status: v.status, count: v._count.status })),
    topDestinations:  [],
    staffPerformance: [],
  })
}
