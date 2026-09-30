// app/api/business/organizations/[id]/requests/[requestId]/services/route.ts
// Walz Business (Release 2)
//
// GET  — the request's services with linked-record summaries. Same
//        visibility as the request detail (any ACTIVE member; TRAVELLER only
//        for requests they submitted or are named on).
// POST — add an UNLINKED service line (serviceType only) to a request.
//        minRole TRAVEL_MANAGER. Customers can NEVER link a Quote/Visa/
//        Itinerary/Trip: they have no way to search those global tables, so
//        any linked*Id / targetId in the body is ignored outright — linking
//        is a staff-only (b2b.manage) action with an exclusivity check (see
//        lib/business/services.ts).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'
import { loadTravelRequestDetail } from '@/lib/business/request-detail'
import { isServiceType, SERVICE_TYPES } from '@/lib/business/services'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const detail = await loadTravelRequestDetail(params.requestId, params.id, {
    kind: 'member', userId: session.user.id, membershipId: access.membership.id, role: access.membership.role,
  })
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ services: detail.services })
}

export async function POST(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // Prong (2): the request must belong to the verified org.
  const travelRequest = await prisma.travelRequest.findUnique({ where: { id: params.requestId }, select: { id: true, organizationId: true } })
  if (!travelRequest || travelRequest.organizationId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const serviceType = typeof body?.serviceType === 'string' ? body.serviceType.trim().toUpperCase() : ''
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: `serviceType must be one of: ${SERVICE_TYPES.join(', ')}` }, { status: 400 })
  }

  // ONLY these two fields are ever written — never any linked*Id.
  const service = await prisma.travelRequestService.create({
    data: { travelRequestId: travelRequest.id, serviceType },
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'travel_request_service.create',
    entityType: 'TravelRequestService',
    entityId: service.id,
    after: { travelRequestId: travelRequest.id, serviceType },
  })

  return NextResponse.json({ service: { id: service.id, serviceType: service.serviceType, links: [] } }, { status: 201 })
}
