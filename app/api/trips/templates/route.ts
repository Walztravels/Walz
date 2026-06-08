import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET — all active templates (public, no auth required) ─────────────────
export async function GET() {
  const templates = await prisma.tripTemplate.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    select: {
      id: true, name: true, destination: true, description: true,
      coverImage: true, duration: true, highlights: true,
      category: true, tags: true, order: true,
    },
  })
  return NextResponse.json({ templates })
}

// ── POST — clone a template into a new trip (auth required) ──────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { templateId, title, startDate } = await req.json().catch(() => ({}))
  if (!templateId) return NextResponse.json({ error: 'templateId required' }, { status: 400 })

  const template = await prisma.tripTemplate.findUnique({ where: { id: templateId } })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const trip = await prisma.trip.create({
    data: {
      userId:      user.id,
      title:       title ?? template.name,
      destination: template.destination,
      description: template.description ?? null,
      coverImage:  template.coverImage ?? null,
      templateId:  template.id,
      startDate:   startDate ? new Date(startDate) : null,
    },
  })

  // Seed days + items from template itinerary
  const itinerary = template.itinerary as any[]
  if (Array.isArray(itinerary)) {
    for (const day of itinerary) {
      const dayDate = startDate
        ? new Date(new Date(startDate).getTime() + (day.dayNumber - 1) * 86400000)
        : null

      const tripDay = await prisma.tripDay.create({
        data: {
          tripId:    trip.id,
          dayNumber: day.dayNumber,
          title:     day.title ?? null,
          date:      dayDate,
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

  const tripFull = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: {
      days: {
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { dayNumber: 'asc' },
      },
    },
  })

  return NextResponse.json({ trip: tripFull }, { status: 201 })
}
