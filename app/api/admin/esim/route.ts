import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [orders, stats] = await Promise.all([
    prisma.esimOrder.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id:              true,
        orderRef:        true,
        destination:     true,
        packageName:     true,
        durationDays:    true,
        dataGb:          true,
        wholesaleCostUsd: true,
        retailPriceUsd:  true,
        marginUsd:       true,
        status:          true,
        purchasedAt:     true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.esimOrder.aggregate({
      _sum:   { retailPriceUsd: true, marginUsd: true },
      _count: { id: true },
      _avg:   { retailPriceUsd: true },
    }),
  ])

  // This month stats
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const monthStats = await prisma.esimOrder.aggregate({
    where:  { createdAt: { gte: startOfMonth } },
    _sum:   { retailPriceUsd: true, marginUsd: true },
    _count: { id: true },
  })

  return NextResponse.json({
    orders,
    stats: {
      totalOrders:    stats._count.id,
      totalRevenue:   stats._sum.retailPriceUsd ?? 0,
      totalMargin:    stats._sum.marginUsd ?? 0,
      avgOrderValue:  stats._avg.retailPriceUsd ?? 0,
      monthOrders:    monthStats._count.id,
      monthRevenue:   monthStats._sum.retailPriceUsd ?? 0,
      monthMargin:    monthStats._sum.marginUsd ?? 0,
    },
  })
}
