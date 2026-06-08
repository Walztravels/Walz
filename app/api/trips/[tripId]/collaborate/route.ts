import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

type Ctx = { params: { tripId: string } }

// ── POST — invite a collaborator ──────────────────────────────────────────
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

  const { email, role } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // Check if already invited
  const existing = await prisma.tripCollaborator.findFirst({
    where: { tripId: params.tripId, email },
  })
  if (existing) {
    return NextResponse.json({ error: 'Already invited' }, { status: 409 })
  }

  // Check if the invitee has a portal account
  const inviteeUser = await prisma.user.findUnique({ where: { email } })

  const inviteToken = nanoid(24)

  const collab = await prisma.tripCollaborator.create({
    data: {
      tripId:      params.tripId,
      userId:      inviteeUser?.id ?? null,
      email,
      role:        role === 'editor' ? 'editor' : 'viewer',
      status:      'pending',
      inviteToken,
    },
  })

  // TODO: send email invite with inviteToken link
  // The accept URL would be: /plan/invite?token=<inviteToken>

  return NextResponse.json({ collaborator: collab, inviteToken }, { status: 201 })
}

// ── PATCH — accept or decline invite ─────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { token, action } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const collab = await prisma.tripCollaborator.findUnique({
    where: { inviteToken: token },
  })
  if (!collab) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })

  const updated = await prisma.tripCollaborator.update({
    where: { id: collab.id },
    data: {
      status: action === 'accept' ? 'accepted' : 'declined',
      userId: user?.id ?? null,
    },
  })

  return NextResponse.json({ collaborator: updated })
}

// ── DELETE — remove a collaborator ────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
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

  const { collaboratorId } = await req.json().catch(() => ({}))
  if (!collaboratorId) return NextResponse.json({ error: 'collaboratorId required' }, { status: 400 })

  await prisma.tripCollaborator.delete({ where: { id: collaboratorId } })
  return NextResponse.json({ success: true })
}
