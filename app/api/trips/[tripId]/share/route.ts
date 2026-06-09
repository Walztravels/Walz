import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

// ── GET — public shared trip (no auth required if shareToken present) ──────
export async function GET(req: NextRequest, { params }: Ctx) {
  const { searchParams } = new URL(req.url)
  const shareToken = searchParams.get('token')

  if (shareToken) {
    // Public share — find by shareToken
    const trip = await prisma.trip.findFirst({
      where: { shareToken, isPublic: true },
      include: {
        days: {
          include: { items: { orderBy: { order: 'asc' } } },
          orderBy: { dayNumber: 'asc' },
        },
      },
    })
    if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ trip })
  }

  // Auth required to view share settings
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

  return NextResponse.json({
    isPublic:   trip.isPublic,
    shareToken: trip.shareToken,
    shareUrl:   trip.shareToken
      ? `${process.env.NEXTAUTH_URL ?? 'https://walztravels.com'}/plan/${params.tripId}/share?token=${trip.shareToken}`
      : null,
  })
}

// ── POST — update share settings ─────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
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

  const { isPublic } = await req.json().catch(() => ({}))

  let shareToken = trip.shareToken
  if (isPublic && !shareToken) {
    shareToken = nanoid(16)
  }

  const updated = await prisma.trip.update({
    where: { id: params.tripId },
    data: {
      isPublic:   !!isPublic,
      shareToken: isPublic ? shareToken : null,
    },
  })

  return NextResponse.json({
    isPublic:   updated.isPublic,
    shareToken: updated.shareToken,
    shareUrl:   updated.shareToken
      ? `${process.env.NEXTAUTH_URL ?? 'https://walztravels.com'}/plan/${params.tripId}/share?token=${updated.shareToken}`
      : null,
  })
}
