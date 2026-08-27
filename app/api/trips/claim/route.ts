// POST /api/trips/claim
// Claims an anonymous DRAFT trip for an authenticated user.
// If the user already has a DRAFT trip, merges items from the anonymous trip into it.
// Security: Only claims trips whose sessionId matches x-walz-session-id header.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'
import { tripClaimRateLimit }        from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function getSessionId(req: NextRequest) {
  return req.headers.get('x-walz-session-id') ?? null
}

// Conservative dedup key: same product type + source + sourceId is treated as the same item.
// If sourceId is absent, title is used instead — never merge purely by title alone.
function itemDedupeKey(item: { type: string; sourceType: string | null; sourceId: string | null; title: string }) {
  if (item.sourceId && item.sourceType) {
    return `${item.type}:${item.sourceType}:${item.sourceId}`.toLowerCase()
  }
  return `${item.type}:title:${item.title}`.toLowerCase()
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = tripClaimRateLimit(ip)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const session   = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!sessionId) {
    return NextResponse.json({ error: 'x-walz-session-id header required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Find the anonymous trip owned by this session
  const anonTrip = await prisma.trip.findFirst({
    where:   { sessionId, userId: null, status: 'DRAFT' },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })

  if (!anonTrip) {
    // Nothing to claim — return the user's existing DRAFT trip if any
    const existing = await prisma.trip.findFirst({
      where:   { userId: user.id, status: 'DRAFT' },
      include: { items: { orderBy: { order: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ trip: existing, merged: false, itemsMerged: 0 })
  }

  // Find the user's existing DRAFT trip
  const userTrip = await prisma.trip.findFirst({
    where:   { userId: user.id, status: 'DRAFT' },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })

  if (!userTrip) {
    // Simple claim: transfer ownership of the anonymous trip
    const claimed = await prisma.trip.update({
      where: { id: anonTrip.id },
      data:  { userId: user.id, sessionId: null },
      include: { items: { orderBy: { order: 'asc' } } },
    })
    return NextResponse.json({ trip: claimed, merged: false, itemsMerged: 0 })
  }

  // Merge: copy non-duplicate items from anonTrip into userTrip
  const existingKeys = new Set(userTrip.items.map(itemDedupeKey))
  const toMerge = anonTrip.items.filter(i => !existingKeys.has(itemDedupeKey(i)))

  if (toMerge.length > 0) {
    const maxOrder = userTrip.items.reduce((m, i) => Math.max(m, i.order ?? 0), 0)
    await prisma.tripItem.createMany({
      data: toMerge.map((item, idx) => ({
        tripId:      userTrip.id,
        type:        item.type,
        title:       item.title,
        cost:        item.cost,
        currency:    item.currency,
        quantity:    item.quantity,
        imageUrl:    item.imageUrl,
        location:    item.location,
        description: item.description,
        externalUrl: item.externalUrl,
        sourceType:  item.sourceType,
        sourceId:    item.sourceId,
        metadata:    item.metadata ?? {},
        order:       maxOrder + idx + 1,
      })),
    })
  }

  // Delete the anonymous trip (items have been merged)
  await prisma.trip.delete({ where: { id: anonTrip.id } })

  const merged = await prisma.trip.findUnique({
    where:   { id: userTrip.id },
    include: { items: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json({ trip: merged, merged: true, itemsMerged: toMerge.length })
}
