// app/api/admin/itineraries/[id]/link-user/route.ts
// Release 6.1 — Track 3: Admin endpoint to explicitly link an itinerary to a portal User.
//
// POST /api/admin/itineraries/:id/link-user
// Body: { userId: string }
//
// Only accessible to authenticated admin staff. Implements conflict detection:
//   - If already linked to the same user → 200 (idempotent)
//   - If linked to a DIFFERENT user → 409 (conflict)
//   - If link succeeds → 200 with result
//
// DELETE /api/admin/itineraries/:id/link-user
// Unlinks the itinerary (sets userId to null). Use only to correct a bad link.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { linkItineraryToUser } from '@/lib/portal/customer-identity'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.userId || typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const itineraryId = params.id

  // Verify the itinerary exists
  const itinerary = await prisma.itinerary.findUnique({
    where:  { id: itineraryId },
    select: { id: true, referenceNumber: true, clientEmail: true, userId: true },
  })
  if (!itinerary) {
    return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
  }

  // Verify the target user exists
  const user = await prisma.user.findUnique({
    where:  { id: body.userId },
    select: { id: true, email: true, name: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const actor = `admin:${session.id}`
  const result = await linkItineraryToUser(itineraryId, body.userId, actor)

  if (result.linked) {
    return NextResponse.json({
      ok: true,
      linked: true,
      itineraryId,
      referenceNumber: itinerary.referenceNumber,
      userId: user.id,
      userEmail: user.email,
    })
  }

  if (result.reason === 'already_linked') {
    return NextResponse.json({
      ok: true,
      linked: false,
      reason: 'already_linked',
      itineraryId,
      userId: itinerary.userId,
    })
  }

  if (result.reason === 'conflict') {
    return NextResponse.json(
      {
        error: 'Itinerary is already linked to a different user',
        itineraryId,
        existingUserId: itinerary.userId,
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ error: 'Link failed', reason: result.reason }, { status: 500 })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const itinerary = await prisma.itinerary.findUnique({
    where:  { id: params.id },
    select: { id: true, referenceNumber: true, userId: true },
  })
  if (!itinerary) {
    return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
  }

  if (!itinerary.userId) {
    return NextResponse.json({ ok: true, unlinked: false, reason: 'not_linked' })
  }

  await prisma.itinerary.update({
    where: { id: params.id },
    data:  { userId: null },
  })

  console.log('[IDENTITY] itinerary.user_unlinked', JSON.stringify({
    itineraryId: params.id,
    referenceNumber: itinerary.referenceNumber,
    removedUserId: itinerary.userId,
    actor: `admin:${session.id}`,
  }))

  return NextResponse.json({
    ok: true,
    unlinked: true,
    itineraryId: params.id,
    referenceNumber: itinerary.referenceNumber,
  })
}
