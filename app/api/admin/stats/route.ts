import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalBookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    weeklyRevenue,
    monthlyRevenue,
    recentBookings,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.booking.count({ where: { status: 'CANCELLED' } }),
    prisma.booking.aggregate({
      where: { createdAt: { gte: startOfWeek }, paymentStatus: 'SUCCEEDED' },
      _sum: { totalAmount: true },
    }),
    prisma.booking.aggregate({
      where: { createdAt: { gte: startOfMonth }, paymentStatus: 'SUCCEEDED' },
      _sum: { totalAmount: true },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        bookingReference: true,
        pnr: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        currency: true,
        contactEmail: true,
        contactPhone: true,
        createdAt: true,
        passengers: true,
        flightDetails: true,
      },
    }),
  ])

  return NextResponse.json({
    totalBookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    weeklyRevenue: weeklyRevenue._sum.totalAmount ?? 0,
    monthlyRevenue: monthlyRevenue._sum.totalAmount ?? 0,
    recentBookings,
  })
}
