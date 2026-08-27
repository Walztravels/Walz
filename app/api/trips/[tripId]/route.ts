import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

function getSessionId(req: NextRequest) {
  return req.headers.get('x-walz-session-id') ?? null
}

async function resolveAccess(req: NextRequest, tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return null

  const session = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  // Authenticated owner
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (user && trip.userId === user.id) return { trip, userId: user.id }
    // Collaborator
    if (user) {
      const collab = await prisma.tripCollaborator.findFirst({
        where: { tripId, userId: user.id, status: 'accepted' },
      })
      if (collab) return { trip, userId: user.id, collab }
    }
  }

  // Anonymous owner via sessionId
  if (sessionId && trip.sessionId === sessionId) return { trip, sessionId }

  // Public read
  if (trip.isPublic) return { trip, readOnly: true }

  return null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const access = await resolveAccess(req, params.tripId)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  return NextResponse.json({ trip, readOnly: access.readOnly ?? false })
}

// ── PATCH — update trip meta ───────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const access = await resolveAccess(req, params.tripId)
  if (!access || access.readOnly) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const {
    title, destination, origin, description, startDate, endDate,
    status, budget, currency, notes, coverImage, isPublic,
    adults, children, infants,
  } = body

  const updated = await prisma.trip.update({
    where: { id: params.tripId },
    data: {
      ...(title       !== undefined && { title }),
      ...(destination !== undefined && { destination }),
      ...(origin      !== undefined && { origin }),
      ...(description !== undefined && { description }),
      ...(startDate   !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate     !== undefined && { endDate:   endDate   ? new Date(endDate)   : null }),
      ...(status      !== undefined && { status }),
      ...(budget      !== undefined && { budget }),
      ...(currency    !== undefined && { currency }),
      ...(notes       !== undefined && { notes }),
      ...(coverImage  !== undefined && { coverImage }),
      ...(isPublic    !== undefined && { isPublic }),
      ...(adults      !== undefined && { adults }),
      ...(children    !== undefined && { children }),
      ...(infants     !== undefined && { infants }),
    },
  })

  return NextResponse.json({ trip: updated })
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const access = await resolveAccess(req, params.tripId)
  if (!access || access.readOnly) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only the owner (userId or sessionId match) can delete
  const trip = access.trip
  const session = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  let isOwner = false
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    isOwner = !!user && trip.userId === user.id
  } else {
    isOwner = !!sessionId && trip.sessionId === sessionId
  }

  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.trip.delete({ where: { id: params.tripId } })
  return NextResponse.json({ success: true })
}
