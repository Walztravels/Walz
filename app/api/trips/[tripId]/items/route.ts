import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { trackCommercialEvent } from '@/lib/commercial/track'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

function getSessionId(req: NextRequest) {
  return req.headers.get('x-walz-session-id') ?? null
}

async function resolveOwnerAccess(req: NextRequest, tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return null

  const session = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return null
    if (trip.userId === user.id) return { trip, userId: user.id }
    const collab = await prisma.tripCollaborator.findFirst({
      where: { tripId, userId: user.id, status: 'accepted' },
    })
    if (collab) return { trip, userId: user.id }
  }

  if (sessionId && trip.sessionId === sessionId) return { trip, sessionId }

  return null
}

// ── GET — all items for a trip ────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const access = await resolveOwnerAccess(req, params.tripId)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const items = await prisma.tripItem.findMany({
    where: { tripId: params.tripId },
    orderBy: [{ dayId: 'asc' }, { order: 'asc' }],
  })

  return NextResponse.json({ items })
}

// ── POST — add an item ────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const access = await resolveOwnerAccess(req, params.tripId)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const {
    dayId, type, title, description, location,
    startTime, endTime, cost, currency, imageUrl,
    externalUrl, bookingRef, confirmed, order,
    metadata, sourceType, sourceId, quantity,
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
      quantity:    quantity    ?? 1,
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

  // Fire commercial event (fire-and-forget)
  void trackCommercialEvent('trip_item_added', {
    sessionId:   access.sessionId ?? undefined,
    userId:      access.userId    ?? undefined,
    productType: type ?? 'CUSTOM',
    productId:   params.tripId,
    metadata:    { itemId: item.id, title, cost, currency },
  })

  return NextResponse.json({ item }, { status: 201 })
}

// ── PATCH — update an item ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const access = await resolveOwnerAccess(req, params.tripId)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'item id required' }, { status: 400 })

  const existing = await prisma.tripItem.findFirst({ where: { id, tripId: params.tripId } })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const {
    dayId, type, title, description, location,
    startTime, endTime, cost, currency, imageUrl,
    externalUrl, bookingRef, confirmed, order, metadata, quantity,
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
      ...(quantity    !== undefined && { quantity }),
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
  const access = await resolveOwnerAccess(req, params.tripId)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'item id required' }, { status: 400 })

  const existing = await prisma.tripItem.findFirst({ where: { id, tripId: params.tripId } })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await prisma.tripItem.delete({ where: { id } })

  void trackCommercialEvent('trip_item_removed', {
    sessionId: access.sessionId ?? undefined,
    userId:    access.userId    ?? undefined,
    productId: params.tripId,
    metadata:  { itemId: id },
  })

  return NextResponse.json({ success: true })
}
