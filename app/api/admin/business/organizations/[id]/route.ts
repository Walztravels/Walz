// app/api/admin/business/organizations/[id]/route.ts — Walz Business (R2)
// GET — staff organization overview (profile + resolved account manager +
// headline counts). Requires 'b2b'. Read-only: there is deliberately no
// PATCH here — every field that may change post-creation has its own
// dedicated, reason-required, audited route (status/, currency/,
// account-manager/).

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, NOT_FOUND } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response

  const organization = await prisma.organization.findUnique({ where: { id: params.id } })
  if (!organization) return NOT_FOUND()

  const [accountManager, memberCount, invitedCount, travellerCount, requestCount, pendingRequestCount] = await Promise.all([
    organization.accountManagerId
      ? prisma.staff.findUnique({
          where: { email: organization.accountManagerId },
          select: { name: true, email: true, isActive: true },
        })
      : Promise.resolve(null),
    prisma.organizationMembership.count({ where: { organizationId: params.id, status: 'ACTIVE' } }),
    prisma.organizationMembership.count({ where: { organizationId: params.id, status: 'INVITED' } }),
    prisma.businessTraveller.count({ where: { organizationId: params.id } }),
    prisma.travelRequest.count({ where: { organizationId: params.id } }),
    prisma.travelRequest.count({ where: { organizationId: params.id, status: { in: ['SUBMITTED', 'AWAITING_APPROVAL'] } } }),
  ])

  return NextResponse.json({
    organization,
    accountManager: accountManager ?? (organization.accountManagerId ? { name: null, email: organization.accountManagerId, isActive: false } : null),
    counts: { members: memberCount, invited: invitedCount, travellers: travellerCount, requests: requestCount, pendingRequests: pendingRequestCount },
  })
}
