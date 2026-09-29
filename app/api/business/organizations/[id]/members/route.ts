// app/api/business/organizations/[id]/members/route.ts — Walz Business (R1)
// GET  — list members. No minRole (any ACTIVE member may see the roster).
// POST — invite a member. minRole ADMIN.
//
// Release 1 limitation (not a deferred-list item, just an implementation
// boundary): OrganizationMembership.userId is required by the schema, so an
// invite can only target an email address that already has a Walz User
// account. Inviting someone with no account yet (self-service signup-esque
// flow) is out of scope here.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, type OrgRole } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

const VALID_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'COORDINATOR', 'TRAVELLER']

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: params.id },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user?.name ?? null,
      email: m.user?.email ?? null,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'ADMIN' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body?.role === 'string' ? body.role.trim().toUpperCase() : ''

  if (!email || !VALID_ROLES.includes(role as OrgRole)) {
    return NextResponse.json({ error: 'A valid email and role are required' }, { status: 400 })
  }

  const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
  if (!invitee) {
    return NextResponse.json(
      { error: 'No Walz account exists for that email address yet' },
      { status: 404 },
    )
  }

  let membership
  try {
    membership = await prisma.organizationMembership.create({
      data: {
        organizationId: params.id,
        userId: invitee.id,
        role,
        status: 'INVITED',
        invitedBy: session.user.email ?? session.user.id,
      },
    })
  } catch {
    return NextResponse.json({ error: 'That person is already a member of this organization' }, { status: 409 })
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'member.invite',
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    after: { userId: invitee.id, role, status: 'INVITED' },
  })

  return NextResponse.json({ member: { id: membership.id, userId: membership.userId, role: membership.role, status: membership.status } }, { status: 201 })
}
