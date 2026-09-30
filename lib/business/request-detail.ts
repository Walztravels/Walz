// lib/business/request-detail.ts — Walz Business (Release 2)
//
// One loader for the TravelRequest detail view, shared by the customer
// portal (app/api/business/.../requests/[requestId] + the detail page) and
// the staff admin equivalent, so the tenant checks cannot drift apart.
//
// TENANT CONTRACT
//   - Returns null unless the request exists AND request.organizationId ===
//     the organizationId argument (the caller's URL org, which the caller has
//     ALREADY verified via assertOrgScopedAccess / staff permission). Every
//     nested read below (travellers, services, approvals, audit) is keyed on
//     the verified request id / org id — never on a client-supplied id.
//   - viewer.kind === 'member' with role TRAVELLER additionally requires the
//     caller to be the submitter or a named (claimed) traveller on the
//     request — identical to the R1 list-filter semantics — else null.
//   - Callers map null to the generic 404.

import prisma from '@/lib/db'
import { loadLinkedSummaries, serializeServices } from '@/lib/business/services'

export type RequestViewer =
  | { kind: 'staff' }
  | { kind: 'member'; userId: string; membershipId: string; role: string }

export async function loadTravelRequestDetail(requestId: string, organizationId: string, viewer: RequestViewer) {
  if (!requestId || !organizationId) return null

  const request = await prisma.travelRequest.findUnique({
    where: { id: requestId },
    include: {
      submittedBy: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
      travellers: {
        include: { businessTraveller: { select: { id: true, firstName: true, lastName: true, email: true, userId: true, organizationId: true } } },
        orderBy: { createdAt: 'asc' },
      },
      services: { orderBy: { createdAt: 'asc' } },
      approvals: {
        include: { approverMembership: { select: { id: true, role: true, user: { select: { name: true, email: true } } } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  // Prong (2): the request must belong to the already-verified org.
  if (!request || request.organizationId !== organizationId) return null

  const isFloorRole = viewer.kind === 'member' && viewer.role === 'TRAVELLER'
  if (isFloorRole) {
    const isSubmitter = request.submittedByMembershipId === viewer.membershipId
    const isNamedTraveller = request.travellers.some(t => t.businessTraveller?.userId === viewer.userId)
    if (!isSubmitter && !isNamedTraveller) return null
  }

  // Defence in depth: a join row pointing at a traveller of another org
  // (should be impossible — the attach route checks it) is never rendered.
  const travellers = request.travellers
    .filter(t => t.businessTraveller && t.businessTraveller.organizationId === organizationId)
    .map(t => ({
      id: t.businessTraveller.id,
      firstName: t.businessTraveller.firstName,
      lastName: t.businessTraveller.lastName,
      // The floor role sees names only — never other travellers' emails.
      email: isFloorRole ? null : t.businessTraveller.email,
      linked: !!t.businessTraveller.userId,
    }))

  const summaries = await loadLinkedSummaries(request.services, { includeFinancials: !isFloorRole })
  const services = serializeServices(request.services, summaries)

  const approvals = request.approvals.map(a => ({
    id: a.id,
    decision: a.decision,
    decidedAt: a.decidedAt,
    reason: a.reason,
    createdAt: a.createdAt,
    approver: a.approverMembership?.user?.name ?? a.approverMembership?.user?.email ?? 'Approver',
    approverRole: a.approverMembership?.role ?? null,
    isMine: viewer.kind === 'member' && a.approverMembershipId === viewer.membershipId,
  }))

  const entityIds = [request.id, ...request.approvals.map(a => a.id), ...request.services.map(s => s.id)]
  const auditRows = await prisma.businessAuditLog.findMany({
    where: { organizationId, entityId: { in: entityIds } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  const actorIds = Array.from(new Set(auditRows.map(r => r.actorUserId).filter((v): v is string => !!v)))
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : []
  const actorName = new Map(actors.map(u => [u.id, u.name ?? u.email ?? 'Member']))

  const timeline = auditRows.map(r => ({
    id: r.id,
    action: r.action,
    at: r.createdAt,
    // Customers see "Walz Travels" for staff actions, never a staff identity.
    actor: r.actorUserId
      ? actorName.get(r.actorUserId) ?? 'Member'
      : r.actorStaffId
        ? (viewer.kind === 'staff' ? r.actorStaffId : 'Walz Travels')
        : 'System',
  }))

  return {
    request: {
      id: request.id,
      title: request.title,
      notes: request.notes,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      requester: request.submittedBy?.user?.name ?? request.submittedBy?.user?.email ?? null,
      requesterRole: request.submittedBy?.role ?? null,
      isMine: viewer.kind === 'member' && request.submittedByMembershipId === viewer.membershipId,
    },
    travellers,
    services,
    approvals,
    timeline,
  }
}

export type TravelRequestDetail = NonNullable<Awaited<ReturnType<typeof loadTravelRequestDetail>>>
