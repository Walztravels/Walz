// app/api/admin/business/organizations/[id]/invitations/route.ts
// Walz Business (Release 2.1) — staff-issued organization invitations.
//
// POST — issue (or re-issue) an OrganizationInvitation for this
// organization. Requires 'b2b.manage'. This is the BOOTSTRAP path: it is
// the only route that can invite an organization's very first
// administrator when NO OrganizationMembership row exists yet for that org
// at all — closing the chicken-and-egg gap where the customer-facing
// members route (app/api/business/organizations/[id]/members/route.ts)
// itself required the caller to already be an ADMIN in that org.
//
// It can also be used by staff to (re-)issue an invitation for any
// subsequent role, but the primary, expected use is the first invite right
// after an organization is created (still ONBOARDING — see
// app/api/admin/business/organizations/route.ts).
//
// Uses lib/business/invitations.ts exclusively — this is the SAME
// OrganizationInvitation model and CAS-acceptance mechanism used by the
// customer-facing members route, never a second parallel system.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { issueOrganizationInvitation } from '@/lib/business/invitations'
import { sendOrganizationInvitationEmail } from '@/lib/business/invitation-email'
import { ALL_ORG_ROLES, isOrgRole } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'b2b.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { email, role } = (body ?? {}) as Record<string, unknown>

  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  const roleUpper = typeof role === 'string' ? role.trim().toUpperCase() : ''
  if (!isOrgRole(roleUpper)) {
    return NextResponse.json({ error: `role must be one of: ${ALL_ORG_ROLES.join(', ')}` }, { status: 400 })
  }

  const organization = await prisma.organization.findUnique({
    where: { id: params.id },
    select: { id: true, legalName: true, tradingName: true },
  })
  if (!organization) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const issued = await issueOrganizationInvitation({
    organizationId: params.id,
    email,
    role: roleUpper,
    invitedByStaffId: session.staffId ?? session.email,
  })
  if (!issued.ok) {
    return NextResponse.json({ error: issued.error }, { status: issued.status })
  }

  const emailSent = await sendOrganizationInvitationEmail({
    to: email.trim().toLowerCase(),
    organizationName: organization.tradingName ?? organization.legalName,
    role: roleUpper,
    token: issued.token,
    expiresAt: issued.expiresAt,
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: session.staffId ?? session.email,
    action: 'invitation.issued',
    entityType: 'OrganizationInvitation',
    entityId: issued.invitationId,
    // Never the token itself.
    after: { email: email.trim().toLowerCase(), role: roleUpper, expiresAt: issued.expiresAt.toISOString(), emailSent },
  })

  return NextResponse.json(
    { invitation: { id: issued.invitationId, expiresAt: issued.expiresAt, emailSent } },
    { status: 201 },
  )
}
