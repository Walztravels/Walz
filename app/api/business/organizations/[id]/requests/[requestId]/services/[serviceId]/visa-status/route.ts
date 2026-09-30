// .../visa-status/route.ts — Walz Business (Release 2.1 remediation)
//
// GET — a SEPARATE, deliberately narrow, business-friendly progress
// projection for a VISA service's linked case. Built instead of widening
// the sensitive .../visa-documents metadata route (which was reverted to
// its original capability-gated boundary after independent review).
//
// This route does NOT use VISA_DOCUMENTS_VIEW as a generic "can see visa
// status" permission — operational status and sensitive-document access are
// two genuinely separate concerns. Authorization here is the ORDINARY
// org-scoping + REFERRAL_PARTNER deny-by-default gate
// (lib/business/org-type-gate.ts::assertAgencyOrCorporateAccess), the same
// tier that already governs the rest of a travel request's own service
// list — NOT the visa-document capability.
//
// ROLE HIERARCHY (unchanged from the rest of R2):
//   - TRAVELLER: may view ONLY a request they are personally the named
//     traveller-of-record on (never an org-wide roster of cases). Verified
//     by an explicit TravelRequestTraveller -> BusinessTraveller.userId
//     join scoped to the caller's own session id — never client-supplied.
//   - COORDINATOR / TRAVEL_MANAGER / APPROVER / FINANCE / ADMIN / OWNER:
//     ordinary org-scoped operational visibility (no additional per-case
//     ownership check), matching the existing R2 role hierarchy.
//
// RETURNED FIELDS ONLY: service/request reference, traveller/client display
// name, destination, visa/service category, a coarse business-friendly
// status bucket, the case's own (already customer-facing elsewhere —
// app/track/[reference]/page.tsx, app/my-account) statusMessage,
// documents-received COUNT, an action-needed flag, and the last status
// update timestamp.
//
// NEVER RETURNED: passport number, passport expiry, document filenames/
// types, signed URLs, storage paths/ids, internal staff notes, or
// embassy/internal processing detail — this route never even SELECTs those
// columns, and never queries VisaCaseDocument rows (only a count()).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import { recordBusinessAudit } from '@/lib/business/audit'
import { toBusinessFriendlyStatus, computeActionNeeded } from '@/lib/business/visa-status'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const service = await loadServiceInRequestInOrg(params.serviceId, params.requestId, params.id)
  if (!service || service.serviceType !== 'VISA') return NOT_FOUND()

  // Floor-role scoping: a TRAVELLER may only see a request they are
  // personally the named traveller-of-record on — never an org-wide
  // roster. Every other role keeps the ordinary org-scoped visibility this
  // gate already established.
  if (access.membership.role === 'TRAVELLER') {
    const ownRecord = await prisma.travelRequestTraveller.findFirst({
      where: { travelRequestId: params.requestId, businessTraveller: { userId: session.user.id } },
      select: { id: true },
    })
    if (!ownRecord) return NOT_FOUND()
  }

  // No case started yet — a legitimate, non-sensitive state, not a 404.
  if (!service.linkedVisaApplicationId) {
    return NextResponse.json(
      {
        reference: null,
        travellerDisplayName: null,
        destination: null,
        serviceCategory: service.serviceType,
        visaType: null,
        businessStatus: 'NOT_STARTED',
        statusMessage: null,
        documentsReceivedCount: 0,
        actionNeeded: true,
        lastStatusUpdateAt: null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const [application, documentsReceivedCount] = await Promise.all([
    prisma.visaApplication.findUnique({
      where: { id: service.linkedVisaApplicationId },
      // Deliberately NO passport/personal fields beyond a display name —
      // see module header.
      select: { referenceNumber: true, firstName: true, lastName: true, destinationIso2: true, visaType: true, status: true, statusMessage: true, updatedAt: true },
    }),
    prisma.visaCaseDocument.count({ where: { applicationId: service.linkedVisaApplicationId } }),
  ])
  if (!application) return NOT_FOUND()

  const businessStatus = toBusinessFriendlyStatus(application.status)

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'visa_status.viewed',
    entityType: 'TravelRequestService',
    entityId: service.id,
    after: { businessStatus },
  })

  return NextResponse.json(
    {
      reference: application.referenceNumber,
      travellerDisplayName: [application.firstName, application.lastName].filter(Boolean).join(' ') || null,
      destination: application.destinationIso2,
      serviceCategory: service.serviceType,
      visaType: application.visaType,
      businessStatus,
      statusMessage: application.statusMessage,
      documentsReceivedCount,
      actionNeeded: computeActionNeeded(businessStatus, documentsReceivedCount),
      lastStatusUpdateAt: application.updatedAt,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
