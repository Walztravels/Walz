import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

async function getAuthorisedTrip(tripId: string, userEmail: string) {
  const user = await prisma.user.findUnique({ where: { email: userEmail } })
  if (!user) return null

  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return null

  // Owner OR collaborator with editor role
  if (trip.userId === user.id) return { trip, user }

  const collab = await prisma.tripCollaborator.findFirst({
    where: { tripId, userId: user.id, status: 'accepted' },
  })
  if (collab) return { trip, user, collab }

  return null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const result = await getAuthorisedTrip(params.tripId, session.user.email)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const trip = await prisma.trip.findUnique({
    where: { id: params.tripId },
    include: {
      days: {
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { dayNumber: 'asc' },
      },
      items: { orderBy: { order: 'asc' } },
      collaborators: {
        select: { id: true, email: true, role: true, status: true },
      },
      proposals: {
        select: { id: true, title: true, status: true, totalCost: true, currency: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      template: { select: { id: true, name: true, destination: true } },
    },
  })

  return NextResponse.json({ trip })
}

// ── PATCH — update trip meta ───────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const result = await getAuthorisedTrip(params.tripId, session.user.email)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const {
    title, destination, description, startDate, endDate,
    status, budget, currency, notes, coverImage, isPublic,
  } = body

  const updated = await prisma.trip.update({
    where: { id: params.tripId },
    data: {
      ...(title       !== undefined && { title }),
      ...(destination !== undefined && { destination }),
      ...(description !== undefined && { description }),
      ...(startDate   !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate     !== undefined && { endDate:   endDate   ? new Date(endDate)   : null }),
      ...(status      !== undefined && { status }),
      ...(budget      !== undefined && { budget }),
      ...(currency    !== undefined && { currency }),
      ...(notes       !== undefined && { notes }),
      ...(coverImage  !== undefined && { coverImage }),
      ...(isPublic    !== undefined && { isPublic }),
    },
  })

  return NextResponse.json({ trip: updated })
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const trip = await prisma.trip.findUnique({ where: { id: params.tripId } })
  if (!trip || trip.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.trip.delete({ where: { id: params.tripId } })
  return NextResponse.json({ success: true })
}
