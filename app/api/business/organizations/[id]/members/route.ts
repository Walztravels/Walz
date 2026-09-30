// app/api/business/organizations/[id]/members/route.ts — Walz Business (R1)
// GET  — list members. minRole COORDINATOR — the full roster (names, emails,
//        roles) is management-tier-and-above visibility. Only the floor role
//        TRAVELLER is denied here (SECURITY FIX, delta review: the ordinary
//        TRAVELLER role must not see the full organization member roster
//        by default). OWNER/ADMIN/TRAVEL_MANAGER/APPROVER/FINANCE/
//        COORDINATOR keep unrestricted roster visibility within their own
//        organization — this never crosses the organization boundary
//        either way, only narrows who sees it within one org.
// POST — invite a member. minRole ADMIN.
//
// Release 1 limitation (not a deferred-list item, just an implementation
// boundary): OrganizationMembership.userId is required by the schema, so an
// invite can only target an email address that already has a Walz User
// account. Inviting someone with no account yet (self-service signup-esque
// flow) is out of scope here.
//
// Release 2: the invitee now receives a customer portal notification
// (lib/portal/notifications.ts — the customer-facing channel, never the
// staff-only lib/notifications/) linking to /business, where they can
// accept via POST .../[id]/invitation/accept. Non-fatal: a notification
// failure never fails the already-committed invite.
//
// Release 2.1: CONVERGED onto lib/business/invitations.ts — the same
// OrganizationInvitation model and SHA-256 token-hash discipline used by
// the staff bootstrap route. This path still requires the invitee to
// already have a Walz User account (an existing member to attach the
// INVITED OrganizationMembership row to today — see the R1 limitation note
// above, which still applies) and still creates that INVITED membership
// immediately, but now ALSO issues a real OrganizationInvitation and sends
// an email via the same token/hash discipline, instead of only an in-app
// notification. There is deliberately only ONE invitation mechanism in this
// codebase — this route must never grow its own separate token logic.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, type OrgRole } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'
import { createCustomerNotification } from '@/lib/portal/notifications'
import { issueOrganizationInvitation } from '@/lib/business/invitations'
import { sendOrganizationInvitationEmail } from '@/lib/business/invitation-email'

export const dynamic = 'force-dynamic'

const VALID_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'COORDINATOR', 'TRAVELLER']

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'COORDINATOR' })
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

  let orgName = 'an organization'
  try {
    const org = await prisma.organization.findUnique({ where: { id: params.id }, select: { legalName: true, tradingName: true } })
    orgName = org?.tradingName ?? org?.legalName ?? orgName
  } catch { /* non-fatal: fall back to a generic name */ }

  // Converged invitation issuance (Release 2.1) — same model/token
  // discipline as the staff bootstrap route. Non-fatal: an email/issuance
  // failure never fails the already-committed INVITED membership row above.
  try {
    const issued = await issueOrganizationInvitation({
      organizationId: params.id,
      email,
      role: role as OrgRole,
      invitedByMembershipId: access.membership.id,
    })
    if (issued.ok) {
      await sendOrganizationInvitationEmail({
        to: email,
        organizationName: orgName,
        role,
        token: issued.token,
        expiresAt: issued.expiresAt,
      })
    }
  } catch (err) {
    console.error('[members.invite] invitation issuance failed (non-fatal):', (err as Error).message)
  }

  await createCustomerNotification({
    userId: invitee.id,
    category: 'ACCOUNT',
    type: 'b2b_member_invited',
    title: `You've been invited to ${orgName} on Walz Business`,
    body: `You've been invited to join as ${role.replace('_', ' ').toLowerCase()}. Open Walz Business to accept.`,
    href: '/business',
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    dedupeKey: `b2b-member-invite:${membership.id}`,
  }).catch(() => {})

  return NextResponse.json({ member: { id: membership.id, userId: membership.userId, role: membership.role, status: membership.status } }, { status: 201 })
}
