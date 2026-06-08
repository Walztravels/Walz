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

// ── GET — all items for a trip ────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const items = await prisma.tripItem.findMany({
    where: { tripId: params.tripId },
    orderBy: [{ dayId: 'asc' }, { order: 'asc' }],
  })

  return NextResponse.json({ items })
}

// ── POST — add an item ────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    dayId, type, title, description, location,
    startTime, endTime, cost, currency, imageUrl,
    externalUrl, bookingRef, confirmed, order,
    metadata, sourceType, sourceId,
  } = body

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const item = await prisma.tripItem.create({
    data: {
      tripId:      params.tripId,
      dayId:       dayId      ?? null,
      type:        type       ?? 'CUSTOM',
      title,
      description: description ?? null,
      location:    location    ?? null,
      startTime:   startTime   ?? null,
      endTime:     endTime     ?? null,
      cost:        cost        ?? null,
      currency:    currency    ?? 'GBP',
      imageUrl:    imageUrl    ?? null,
      externalUrl: externalUrl ?? null,
      bookingRef:  bookingRef  ?? null,
      confirmed:   confirmed   ?? false,
      order:       order       ?? 0,
      metadata:    metadata    ?? {},
      sourceType:  sourceType  ?? null,
      sourceId:    sourceId    ?? null,
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}

// ── PATCH — update an item ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'item id required' }, { status: 400 })

  // Confirm the item belongs to this trip
  const existing = await prisma.tripItem.findFirst({ where: { id, tripId: params.tripId } })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const {
    dayId, type, title, description, location,
    startTime, endTime, cost, currency, imageUrl,
    externalUrl, bookingRef, confirmed, order, metadata,
  } = rest

  const item = await prisma.tripItem.update({
    where: { id },
    data: {
      ...(dayId       !== undefined && { dayId }),
      ...(type        !== undefined && { type }),
      ...(title       !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(location    !== undefined && { location }),
      ...(startTime   !== undefined && { startTime }),
      ...(endTime     !== undefined && { endTime }),
      ...(cost        !== undefined && { cost }),
      ...(currency    !== undefined && { currency }),
      ...(imageUrl    !== undefined && { imageUrl }),
      ...(externalUrl !== undefined && { externalUrl }),
      ...(bookingRef  !== undefined && { bookingRef }),
      ...(confirmed   !== undefined && { confirmed }),
      ...(order       !== undefined && { order }),
      ...(metadata    !== undefined && { metadata }),
    },
  })

  return NextResponse.json({ item })
}

// ── DELETE — remove an item ────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await getAuthorisedUser(session.user.email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!(await canAccessTrip(params.tripId, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'item id required' }, { status: 400 })

  const existing = await prisma.tripItem.findFirst({ where: { id, tripId: params.tripId } })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await prisma.tripItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
