import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { TripStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const status = searchParams.get('status') ?? ''

  const trips = await prisma.trip.findMany({
    where: {
      ...(search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { destination: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(status && Object.values(TripStatus).includes(status as TripStatus) ? { status: status as TripStatus } : {}),
    },
    include: {
      days: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { dayNumber: 'asc' } },
      proposals: { orderBy: { createdAt: 'desc' }, take: 1 },
      user: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ trips })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()

  const trip = await prisma.trip.create({
    data: {
      userId: data.userId || session.id,
      title: data.title,
      destination: data.destination,
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      budget: data.budget,
      currency: data.currency || 'GBP',
      notes: data.notes,
      status: 'DRAFT',
    },
  })

  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    for (let i = 0; i < numDays; i++) {
      const date = new Date(start)
      date.setDate(date.getDate() + i)
      await prisma.tripDay.create({
        data: { tripId: trip.id, dayNumber: i + 1, date, title: `Day ${i + 1}` },
      })
    }
  }

  return NextResponse.json({ trip })
}
