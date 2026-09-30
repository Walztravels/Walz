// app/api/business/organizations/[id]/requests/[requestId]/approve/route.ts
// Walz Business (Release 1)
// POST — record an APPROVE or REJECT decision. minRole APPROVER (also
// admits the peer-tier TRAVEL_MANAGER/FINANCE roles — see
// lib/business/authz.ts for the documented role ordering).
//
// CONCURRENCY: this is the exact atomic compare-and-swap pattern already
// established in this codebase for Staff Check-in V2's waive-deduction race
// fix (app/api/admin/check-ins/[id]/route.ts) — an updateMany() keyed on the
// row still being in its PENDING state, checking `count`, so a decided
// TravelApproval row can never be silently overwritten by a concurrent
// second decision. See the TravelApproval.decision comment in
// prisma/schema.prisma for the immutability invariant this enforces.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // R2.1 remediation: REFERRAL_PARTNER organizations are denied outright —
  // approving/rejecting a travel request is a booking/service-ownership
  // action.
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'APPROVER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Cross-organization guard: the TravelRequest must both exist AND belong
  // to the organization the caller was just verified against — an ACTIVE
  // member of Org A can never act on Org B's TravelRequest by id-guessing.
  // Both "doesn't exist" and "belongs to a different org" collapse to the
  // same generic 404, same as assertOrgScopedAccess's own contract.
  const travelRequest = await prisma.travelRequest.findUnique({ where: { id: params.requestId } })
  if (!travelRequest || travelRequest.organizationId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const decision = body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED'
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : null

  // Find-or-create this approver's row. The unique constraint on
  // (travelRequestId, approverMembershipId) makes a concurrent create race
  // safe: the loser's create() throws, and it simply re-reads the row the
  // winner just inserted before falling through to the CAS below.
  let approval = await prisma.travelApproval.findUnique({
    where: {
      travelRequestId_approverMembershipId: {
        travelRequestId: params.requestId,
        approverMembershipId: access.membership.id,
      },
    },
  })

  if (!approval) {
    try {
      approval = await prisma.travelApproval.create({
        data: {
          travelRequestId: params.requestId,
          approverMembershipId: access.membership.id,
          decision: 'PENDING',
        },
      })
    } catch {
      approval = await prisma.travelApproval.findUnique({
        where: {
          travelRequestId_approverMembershipId: {
            travelRequestId: params.requestId,
            approverMembershipId: access.membership.id,
          },
        },
      })
      if (!approval) {
        return NextResponse.json({ error: 'Could not record approval' }, { status: 500 })
      }
    }
  }

  if (approval.decision !== 'PENDING') {
    return NextResponse.json(
      { error: 'This approval has already been decided', decision: approval.decision },
      { status: 409 },
    )
  }

  // ── THE ATOMIC COMPARE-AND-SWAP ──────────────────────────────────────────
  // Two concurrent POSTs can both reach this line having read decision:
  // 'PENDING' above. Only the write whose WHERE clause still matches
  // decision:'PENDING' in the database AT WRITE TIME succeeds — the loser's
  // count is 0. This is the single source of truth for "who won"; the
  // findUnique above is just an optimization to avoid a needless create.
  const cas = await prisma.travelApproval.updateMany({
    where: { id: approval.id, decision: 'PENDING' },
    data: { decision, decidedAt: new Date(), reason },
  })

  if (cas.count === 0) {
    const fresh = await prisma.travelApproval.findUnique({ where: { id: approval.id } })
    return NextResponse.json(
      { error: 'This approval has already been decided', decision: fresh?.decision ?? null },
      { status: 409 },
    )
  }

  // Best-effort mirror of the decision onto the parent TravelRequest's own
  // status — not itself the concurrency guard (the CAS above already is).
  await prisma.travelRequest
    .update({
      where: { id: params.requestId },
      data: { status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED' },
    })
    .catch(() => {})

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: decision === 'APPROVED' ? 'travel_request.approve' : 'travel_request.reject',
    entityType: 'TravelApproval',
    entityId: approval.id,
    before: { decision: 'PENDING' },
    after: { decision, reason },
  })

  return NextResponse.json({ approval: { id: approval.id, decision, reason } })
}
