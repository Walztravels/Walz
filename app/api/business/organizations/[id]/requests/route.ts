// app/api/business/organizations/[id]/requests/route.ts — Walz Business (R1)
// GET  — list TravelRequests for the org. No minRole (any ACTIVE member may
//        call this), BUT the results are filtered by role (SECURITY FIX,
//        delta review): the floor role TRAVELLER sees only requests they
//        themselves submitted OR that name them as a traveller — never the
//        organization's full request list. COORDINATOR and above (the
//        management tier and OWNER/ADMIN) see every request in the org, as
//        before. This never crosses the organization boundary either way —
//        assertOrgScopedAccess above already guarantees that; this is a
//        narrower, within-org filter on top of it.
// POST — create a DRAFT TravelRequest. minRole TRAVEL_MANAGER.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // TRAVELLER is the one role this filter restricts (see module header) —
  // every other role (COORDINATOR and above) keeps the full org-wide list.
  const isFloorRole = access.membership.role === 'TRAVELLER'

  const requests = await prisma.travelRequest.findMany({
    where: isFloorRole
      ? {
          organizationId: params.id,
          OR: [
            { submittedByMembershipId: access.membership.id },
            { travellers: { some: { businessTraveller: { userId: session.user.id } } } },
          ],
        }
      : { organizationId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    requests: requests.map(r => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      status: r.status,
      submittedByMembershipId: r.submittedByMembershipId,
      createdAt: r.createdAt,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : null
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 5000) : null

  const travelRequest = await prisma.travelRequest.create({
    data: {
      organizationId: params.id,
      submittedByMembershipId: access.membership.id,
      status: 'DRAFT',
      title,
      notes,
    },
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'travel_request.create',
    entityType: 'TravelRequest',
    entityId: travelRequest.id,
    after: { title, status: 'DRAFT' },
  })

  return NextResponse.json(
    { request: { id: travelRequest.id, title: travelRequest.title, notes: travelRequest.notes, status: travelRequest.status } },
    { status: 201 },
  )
}
