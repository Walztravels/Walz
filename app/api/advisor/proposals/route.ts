import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET — all proposals ────────────────────────────────────────────────────
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const proposals = await prisma.tripProposal.findMany({
    include: {
      trip: {
        select: {
          id: true, title: true, destination: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ proposals })
}

// ── POST — create a proposal ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { tripId, title, content, itinerary, totalCost, currency, validUntil } = body ?? {}

  if (!tripId || !title || !content) {
    return NextResponse.json({ error: 'tripId, title, and content required' }, { status: 400 })
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const proposal = await prisma.tripProposal.create({
    data: {
      tripId,
      staffId:   (admin as any).id   ?? null,
      staffName: (admin as any).name ?? null,
      title,
      content,
      itinerary:  itinerary  ?? [],
      totalCost:  totalCost  ?? null,
      currency:   currency   ?? 'GBP',
      validUntil: validUntil ? new Date(validUntil) : null,
      status: 'draft',
    },
    include: { trip: { select: { title: true, destination: true } } },
  })

  return NextResponse.json({ proposal }, { status: 201 })
}

// ── PATCH — update proposal status ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id, status, content, title, totalCost, itinerary, pdfUrl } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const proposal = await prisma.tripProposal.update({
    where: { id },
    data: {
      ...(status    !== undefined && { status }),
      ...(content   !== undefined && { content }),
      ...(title     !== undefined && { title }),
      ...(totalCost !== undefined && { totalCost }),
      ...(itinerary !== undefined && { itinerary }),
      ...(pdfUrl    !== undefined && { pdfUrl }),
    },
  })

  return NextResponse.json({ proposal })
}
