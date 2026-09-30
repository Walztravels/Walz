// app/api/admin/business/organizations/[id]/requests/[requestId]/services/route.ts
// Walz Business (Release 2)
// POST { serviceType, reason } — staff adds a service line to one of the
// org's requests. Requires 'b2b.manage' + reason; audited. The request must
// belong to params.id. Linking a mature record is a separate step
// (.../services/[serviceId]/link).

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { requireB2bStaff, NOT_FOUND, readJsonBody, requiredReason, staffActorId } from '@/lib/business/admin-guard'
import { isServiceType, SERVICE_TYPES } from '@/lib/business/services'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const body = await readJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const serviceType = typeof body.serviceType === 'string' ? body.serviceType.trim().toUpperCase() : ''
  if (!isServiceType(serviceType)) {
    return NextResponse.json({ error: `serviceType must be one of: ${SERVICE_TYPES.join(', ')}` }, { status: 400 })
  }
  const reason = requiredReason(body.reason)
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

  const travelRequest = await prisma.travelRequest.findUnique({ where: { id: params.requestId }, select: { id: true, organizationId: true } })
  if (!travelRequest || travelRequest.organizationId !== params.id) return NOT_FOUND()

  const service = await prisma.travelRequestService.create({ data: { travelRequestId: travelRequest.id, serviceType } })

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: staffActorId(guard.session),
    action: 'travel_request_service.create',
    entityType: 'TravelRequestService',
    entityId: service.id,
    after: { travelRequestId: travelRequest.id, serviceType, reason },
  })

  return NextResponse.json({ service: { id: service.id, serviceType } }, { status: 201 })
}
