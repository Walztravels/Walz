// app/api/business/organizations/[id]/invitation/accept/route.ts
// Walz Business (Release 2)
// POST — the signed-in user accepts THEIR OWN pending invitation to
// organization params.id, transitioning their membership INVITED -> ACTIVE.
//
// SECURITY
//   - Session-gated. The membership is looked up ONLY by the
//     (params.id, session.user.id) pair via assertPendingInvitation() — the
//     body is ignored entirely, so there is no membership id / user id a
//     caller could supply to accept someone else's invite or an invite in
//     another organization.
//   - Atomic CAS: updateMany keyed on { id, userId, organizationId,
//     status: 'INVITED' }, checking count === 1 — a double-click / replay /
//     concurrent accept can only succeed once; a membership an admin
//     suspended/removed in the meantime can never be re-activated here.
//   - An organization that is SUSPENDED or CLOSED cannot be joined.
//   - Every denial is the same generic 404 (no enumeration oracle).
//   - Audited as member.accept_invite.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertPendingInvitation } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

const BLOCKED_ORG_STATUSES = ['SUSPENDED', 'CLOSED']

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const invite = await assertPendingInvitation(session.user.id, params.id)
  if (!invite.ok) {
    return NextResponse.json({ error: invite.error }, { status: invite.status })
  }

  const organization = await prisma.organization.findUnique({ where: { id: params.id }, select: { status: true } })
  if (!organization || BLOCKED_ORG_STATUSES.includes(organization.status)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const now = new Date()
  const cas = await prisma.organizationMembership.updateMany({
    where: {
      id: invite.membership.id,
      organizationId: params.id,
      userId: session.user.id,
      status: 'INVITED',
    },
    data: { status: 'ACTIVE', joinedAt: now },
  })
  if (cas.count !== 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'member.accept_invite',
    entityType: 'OrganizationMembership',
    entityId: invite.membership.id,
    before: { status: 'INVITED' },
    after: { status: 'ACTIVE', role: invite.membership.role },
  })

  return NextResponse.json({ member: { id: invite.membership.id, role: invite.membership.role, status: 'ACTIVE' } })
}
