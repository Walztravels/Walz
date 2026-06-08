import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

// ── GET — all trips for the authenticated user ─────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const trips = await prisma.trip.findMany({
    where: { userId: user.id },
    include: {
      days:  { select: { id: true, dayNumber: true, title: true, date: true } },
      items: { select: { id: true, type: true, title: true, confirmed: true } },
      template: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ trips })
}

// ── POST — create a new trip ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.destination) {
    return NextResponse.json({ error: 'title and destination required' }, { status: 400 })
  }

  const { title, destination, description, startDate, endDate, budget, currency, templateId } = body

  // If cloning from template, pull its itinerary
  let template = null
  if (templateId) {
    template = await prisma.tripTemplate.findUnique({ where: { id: templateId } })
  }

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title,
      destination,
      description: description ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate:   endDate   ? new Date(endDate)   : null,
      budget:    budget    ?? null,
      currency:  currency  ?? 'GBP',
      templateId: template?.id ?? null,
      coverImage: template?.coverImage ?? null,
    },
  })

  // Seed days + items from template itinerary
  if (template && Array.isArray((template.itinerary as any[]))) {
    const itinerary = template.itinerary as any[]
    for (const day of itinerary) {
      const tripDay = await prisma.tripDay.create({
        data: {
          tripId:    trip.id,
          dayNumber: day.dayNumber,
          title:     day.title ?? null,
          date: startDate
            ? new Date(new Date(startDate).getTime() + (day.dayNumber - 1) * 86400000)
            : null,
        },
      })

      if (Array.isArray(day.items)) {
        for (let i = 0; i < day.items.length; i++) {
          const item = day.items[i]
          await prisma.tripItem.create({
            data: {
              tripId:      trip.id,
              dayId:       tripDay.id,
              type:        item.type ?? 'CUSTOM',
              title:       item.title,
              description: item.description ?? null,
              location:    item.location ?? null,
              startTime:   item.startTime ?? null,
              endTime:     item.endTime ?? null,
              order:       i,
            },
          })
        }
      }
    }
  }

  const tripWithDays = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      days:  { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { dayNumber: 'asc' } },
      items: { orderBy: { order: 'asc' } },
    },
  })

  return NextResponse.json({ trip: tripWithDays }, { status: 201 })
}
