import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bookings = await prisma.activityBooking.findMany({
    orderBy: { createdAt: 'desc' },
    include: { activity: { select: { title: true, location: true } } },
  })
  return NextResponse.json({ bookings })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const booking = await prisma.activityBooking.create({ data })
  return NextResponse.json({ booking })
}
