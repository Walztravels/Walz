import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      bookingReference: true,
      pnr: true,
      type: true,
      status: true,
      totalAmount: true,
      currency: true,
      contactEmail: true,
      contactPhone: true,
      flightDetails: true,
      hotelDetails: true,
      passengers: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ bookings })
}
