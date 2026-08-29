import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const RATES: Record<string, number> = {
  sales_agent: 0.05,
  sales_rep:   0.03,
  coordinator: 0.02,
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const staff = await prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
    })

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const commissions = await Promise.all(
      staff.map(async s => {
        const bookings = await prisma.booking.findMany({
          where: { createdByStaffId: s.id, createdAt: { gte: startOfMonth } },
          select: { totalAmount: true, currency: true },
        })
        const currencyRevenue: Record<string, number> = {}
        for (const b of bookings) {
          const cur = b.currency || 'GBP'
          currencyRevenue[cur] = (currencyRevenue[cur] || 0) + (b.totalAmount ?? 0)
        }
        const revenue    = Object.values(currencyRevenue).reduce((s, v) => s + v, 0)
        const rate       = RATES[s.role] ?? 0.01
        const commission = revenue * rate
        return { ...s, bookings: bookings.length, revenue, currencyRevenue, rate, commission, status: 'unpaid' }
      }),
    )

    return NextResponse.json({ commissions })
  } catch (err) {
    console.error('[commissions GET]', err)
    return NextResponse.json({ error: 'Failed to load commissions' }, { status: 500 })
  }
}
