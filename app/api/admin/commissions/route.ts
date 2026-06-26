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
          select: { totalAmount: true },
        })
        const revenue    = bookings.reduce((sum, b) => sum + (b.totalAmount ?? 0), 0)
        const rate       = RATES[s.role] ?? 0.01
        const commission = revenue * rate
        return { ...s, bookings: bookings.length, revenue, rate, commission, status: 'unpaid' }
      }),
    )

    return NextResponse.json({ commissions })
  } catch (err) {
    console.error('[commissions GET]', err)
    return NextResponse.json({ error: 'Failed to load commissions' }, { status: 500 })
  }
}
