// app/api/admin/business/organizations/[id]/requests/[requestId]/services/[serviceId]/link/route.ts
// Walz Business (Release 2) — THE TravelRequestService linking action.
//
// POST { action: 'link',   kind, targetId, reason }
// POST { action: 'unlink', kind, reason }
//
// Requires 'b2b.manage' + reason; every change is audited before/after.
// `targetId` comes from the staff search/select picker
// (GET .../link-candidates) — the UI never asks for a pasted id — but the
// server re-verifies everything regardless:
//
//   1. The service must hang off params.requestId, and that request must
//      belong to params.id (loadServiceInRequestInOrg — prong 2).
//   2. The link kind must be valid for the service type (ALLOWED_LINKS).
//   3. Inside a SERIALIZABLE transaction:
//        a. the target record must exist;
//        b. it must NOT already be linked to any service of a DIFFERENT
//           organization (findForeignOrganizationLink) — this is what makes
//           an org-A request un-linkable to an org-B Quote/Visa/Itinerary/
//           Trip even when the caller supplies org B's real record id;
//        c. compare-and-swap: the service's link column must still be NULL
//           (never silently overwrite an existing link — unlink first).
//      Serializable isolation closes the check-then-write race between two
//      staff linking the same record to two different organizations.

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { requireB2bStaff, NOT_FOUND, readJsonBody, requiredReason, staffActorId } from '@/lib/business/admin-guard'
import {
  ALLOWED_LINKS, LINK_COLUMN, findForeignOrganizationLink, isLinkKind, isServiceType,
  linkTargetExists, loadServiceInRequestInOrg,
} from '@/lib/business/services'

export const dynamic = 'force-dynamic'

type LinkOutcome = 'linked' | 'missing' | 'foreign' | 'occupied'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string } },
) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const body = await readJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { action, kind } = body
  if (action !== 'link' && action !== 'unlink') {
    return NextResponse.json({ error: "action must be 'link' or 'unlink'" }, { status: 400 })
  }
  if (!isLinkKind(kind)) return NextResponse.json({ error: 'Invalid link kind' }, { status: 400 })
  const reason = requiredReason(body.reason)
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

  const service = await loadServiceInRequestInOrg(params.serviceId, params.requestId, params.id)
  if (!service) return NOT_FOUND()

  const column = LINK_COLUMN[kind]
  const actor = staffActorId(guard.session)

  if (action === 'unlink') {
    const current = service[column]
    if (!current) return NextResponse.json({ error: 'Nothing is linked for that kind' }, { status: 409 })
    const cas = await prisma.travelRequestService.updateMany({
      where: { id: service.id, travelRequestId: params.requestId, [column]: current },
      data: { [column]: null },
    })
    if (cas.count !== 1) {
      return NextResponse.json({ error: 'The service was changed by someone else — reload and try again' }, { status: 409 })
    }
    await recordBusinessAudit({
      organizationId: params.id,
      actorStaffId: actor,
      action: 'travel_request_service.unlinked',
      entityType: 'TravelRequestService',
      entityId: service.id,
      before: { kind, targetId: current },
      after: { kind, targetId: null, reason },
    })
    return NextResponse.json({ service: { id: service.id, [column]: null } })
  }

  // ── link ──────────────────────────────────────────────────────────────
  const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : ''
  if (!targetId || targetId.length > 64) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })

  if (!isServiceType(service.serviceType) || !ALLOWED_LINKS[service.serviceType].includes(kind)) {
    return NextResponse.json({ error: `A ${service.serviceType} service cannot link a ${kind}` }, { status: 400 })
  }

  let outcome: LinkOutcome
  try {
    outcome = await prisma.$transaction(async tx => {
      if (!(await linkTargetExists(tx, kind, targetId))) return 'missing' as const
      if (await findForeignOrganizationLink(tx, kind, targetId, params.id)) return 'foreign' as const
      const cas = await tx.travelRequestService.updateMany({
        where: { id: service.id, travelRequestId: params.requestId, [column]: null },
        data: { [column]: targetId },
      })
      return cas.count === 1 ? ('linked' as const) : ('occupied' as const)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch {
    // Serialization failure (a concurrent link touched the same rows).
    return NextResponse.json({ error: 'Another change happened at the same time — try again' }, { status: 409 })
  }

  if (outcome === 'missing') return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  if (outcome === 'foreign') {
    return NextResponse.json({ error: 'That record already belongs to another organization and cannot be linked here' }, { status: 409 })
  }
  if (outcome === 'occupied') {
    return NextResponse.json({ error: 'This service already has a linked record of that kind — unlink it first' }, { status: 409 })
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: actor,
    action: 'travel_request_service.linked',
    entityType: 'TravelRequestService',
    entityId: service.id,
    before: { kind, targetId: null },
    after: { kind, targetId, reason },
  })

  return NextResponse.json({ service: { id: service.id, [column]: targetId } })
}
