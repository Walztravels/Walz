// app/api/admin/business/organizations/[id]/members/[membershipId]/capabilities/route.ts
// Walz Business (Release 2)
//
// POST { capability, action: 'grant' | 'revoke', reason }
//   Staff-only explicit capability management. Requires 'b2b.manage' + a
//   non-empty reason, and writes a before/after audit row. See
//   lib/business/capabilities.ts for the model and invariants.
//
// TENANT: the membership must belong to params.id — a membership id from
// another organization is the same generic 404 as a nonexistent one.
// The floor TRAVELLER role can never be granted a capability; ADMIN/OWNER do
// not need one (they hold the hardcoded baseline) so a grant is refused as
// a no-op rather than silently stored.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { requireB2bStaff, NOT_FOUND, readJsonBody, requiredReason, staffActorId } from '@/lib/business/admin-guard'
import { isMembershipCapability, CAPABILITY_INELIGIBLE_ROLES } from '@/lib/business/capabilities'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string; membershipId: string } }) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const body = await readJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { capability, action } = body
  if (!isMembershipCapability(capability)) {
    return NextResponse.json({ error: 'Unknown capability' }, { status: 400 })
  }
  if (action !== 'grant' && action !== 'revoke') {
    return NextResponse.json({ error: "action must be 'grant' or 'revoke'" }, { status: 400 })
  }
  const reason = requiredReason(body.reason)
  if (!reason) return NextResponse.json({ error: 'A reason is required for a capability change' }, { status: 400 })

  const membership = await prisma.organizationMembership.findUnique({
    where: { id: params.membershipId },
    select: { id: true, organizationId: true, role: true, status: true, userId: true },
  })
  if (!membership || membership.organizationId !== params.id) return NOT_FOUND()

  const actor = staffActorId(guard.session)

  if (action === 'grant') {
    if ((CAPABILITY_INELIGIBLE_ROLES as readonly string[]).includes(membership.role)) {
      return NextResponse.json({ error: 'This role can never hold that capability' }, { status: 400 })
    }
    if (membership.role === 'ADMIN' || membership.role === 'OWNER') {
      return NextResponse.json({ error: 'ADMIN and OWNER already have visa-document access by default' }, { status: 400 })
    }
    if (membership.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Capabilities can only be granted to an ACTIVE membership' }, { status: 400 })
    }

    const existing = await prisma.organizationMembershipCapability.findFirst({
      where: { membershipId: membership.id, organizationId: params.id, capability, revokedAt: null },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ error: 'That capability is already granted' }, { status: 409 })

    let grant
    try {
      grant = await prisma.organizationMembershipCapability.create({
        data: {
          membershipId: membership.id,
          organizationId: params.id,
          capability,
          grantedByStaffId: actor,
          grantReason: reason,
        },
      })
    } catch {
      // Partial unique index (one active grant per membership+capability)
      // lost a concurrent race.
      return NextResponse.json({ error: 'That capability is already granted' }, { status: 409 })
    }

    await recordBusinessAudit({
      organizationId: params.id,
      actorStaffId: actor,
      action: 'membership.capability_granted',
      entityType: 'OrganizationMembership',
      entityId: membership.id,
      before: { capability, active: false },
      after: { capability, active: true, grantId: grant.id, reason },
    })
    return NextResponse.json({ capability: { id: grant.id, capability, active: true } }, { status: 201 })
  }

  // revoke — soft stamp, CAS on the grant still being active.
  const cas = await prisma.organizationMembershipCapability.updateMany({
    where: { membershipId: membership.id, organizationId: params.id, capability, revokedAt: null },
    data: { revokedAt: new Date(), revokedByStaffId: actor, revokeReason: reason },
  })
  if (cas.count === 0) return NextResponse.json({ error: 'That capability is not currently granted' }, { status: 409 })

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: actor,
    action: 'membership.capability_revoked',
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    before: { capability, active: true },
    after: { capability, active: false, reason },
  })
  return NextResponse.json({ capability: { capability, active: false } })
}
