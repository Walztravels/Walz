import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { trackCommercialEvent } from '@/lib/commercial/track'

export const dynamic = 'force-dynamic'

function getSessionId(req: NextRequest) {
  return req.headers.get('x-walz-session-id') ?? null
}

// Returns the most recent DRAFT trip for this user/session, or creates one
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  if (!session?.user?.email && !sessionId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const where = session?.user?.email
    ? { user: { email: session.user.email }, status: 'DRAFT' as const }
    : { sessionId, status: 'DRAFT' as const }

  const trip = await prisma.trip.findFirst({
    where,
    include: {
      items: { orderBy: { order: 'asc' } },
      days:  { orderBy: { dayNumber: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ trip })
}

// Create (or return existing) DRAFT trip — idempotent
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  if (!session?.user?.email && !sessionId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let userId: string | null = null
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    userId = user.id
  }

  const body = await req.json().catch(() => ({}))
  const { destination, origin, adults, children, infants, currency } = body

  // Return existing DRAFT if one exists
  const existing = await prisma.trip.findFirst({
    where: userId
      ? { userId, status: 'DRAFT' }
      : { sessionId, status: 'DRAFT' },
    include: { items: { orderBy: { order: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  if (existing) return NextResponse.json({ trip: existing, created: false })

  const trip = await prisma.trip.create({
    data: {
      userId:      userId    ?? null,
      sessionId:   userId    ? null : (sessionId ?? null),
      title:       destination ? `Trip to ${destination}` : 'My Trip',
      destination: destination ?? '',
      origin:      origin      ?? null,
      currency:    currency    ?? 'GBP',
      adults:      adults      ?? 1,
      children:    children    ?? 0,
      infants:     infants     ?? 0,
    },
    include: { items: { orderBy: { order: 'asc' } } },
  })

  void trackCommercialEvent('trip_created', {
    sessionId: sessionId ?? undefined,
    userId:    userId    ?? undefined,
    productType: 'trip',
    productId:   trip.id,
    destination: destination ?? undefined,
  })

  return NextResponse.json({ trip, created: true }, { status: 201 })
}
