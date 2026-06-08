import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

async function getAuthorisedUser(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

async function canAccessTrip(tripId: string, userId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return false
  if (trip.userId === userId) return true
  const collab = await prisma.tripCollaborator.findFirst({
    where: { tripId, userId, status: 'accepted' },
  })
  return !!collab
}

// ── GET — all days for a trip ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const days = await prisma.tripDay.findMany({
    where: { tripId: params.tripId },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: { dayNumber: 'asc' },
  })

  return NextResponse.json({ days })
}

// ── POST — add a day ───────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { dayNumber, title, date, notes } = body

  if (!dayNumber) return NextResponse.json({ error: 'dayNumber required' }, { status: 400 })

  const day = await prisma.tripDay.create({
    data: {
      tripId:    params.tripId,
      dayNumber: Number(dayNumber),
      title:     title ?? null,
      date:      date  ? new Date(date) : null,
      notes:     notes ?? null,
    },
    include: { items: true },
  })

  return NextResponse.json({ day }, { status: 201 })
}

// ── DELETE — remove a day (and its items) ──────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { dayId } = await req.json().catch(() => ({}))
  if (!dayId) return NextResponse.json({ error: 'dayId required' }, { status: 400 })

  await prisma.tripDay.delete({ where: { id: dayId } })
  return NextResponse.json({ success: true })
}
