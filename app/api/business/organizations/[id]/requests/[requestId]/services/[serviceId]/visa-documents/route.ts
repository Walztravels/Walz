// app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/route.ts
// Walz Business (Release 2; boundary RESTORED in Release 2.1 remediation)
//
// GET — document METADATA (type, file name, size, uploaded date, scan
// status) for the visa case linked to one VISA service of one travel
// request. Never returns a storage path, signed URL, or file bytes — see
// .../visa-documents/[documentId]/content/route.ts for that.
//
// REMEDIATION NOTE: R2.1 originally broadened this route's authorization
// from the capability-gated boundary below to "any ACTIVE member of the
// organization, any role" — exposing applicant identity, destination, visa
// type, status, and passport expiry to the floor TRAVELLER role. An
// independent security review rejected that change as NOT approved for
// shipping. This route is restored to its EXACT pre-R2.1 (production main)
// authorization boundary: the same lib/business/capabilities.ts::
// assertVisaDocumentAccess() capability gate as before, completely
// unchanged. The only R2.1 addition here is an ADDITIONAL, PRIOR
// REFERRAL_PARTNER deny-by-default layer (a pure narrowing — see
// lib/business/document-authz.ts::assertVisaDocumentAccessDenyingReferralPartners),
// plus the additive `scanStatus` field on the existing document-metadata
// rows (same sensitivity tier as the fileSize/mimeType fields already
// returned here — not part of the access-control boundary).
//
// A SEPARATE, narrower, genuinely business-friendly status surface (for
// Corporate/Agency users who need to track case progress WITHOUT seeing
// passport/document-sensitive metadata) was built instead of loosening this
// route — see .../visa-status/route.ts and lib/business/visa-status.ts.
//
// AUTHORIZATION (both prongs, then the explicit capability):
//   (1) lib/business/document-authz.ts::assertVisaDocumentAccessDenyingReferralPartners(user, org) —
//       REFERRAL_PARTNER organizations denied FIRST, unconditionally, THEN
//       the unchanged assertVisaDocumentAccess(): ADMIN/OWNER baseline OR an
//       explicit, un-revoked VISA_DOCUMENTS_VIEW grant on the caller's
//       ACTIVE non-TRAVELLER membership of THIS org. Never inferred from
//       role alone, never from any staff permission.
//   (2) lib/business/services.ts::loadServiceInRequestInOrg() — the service
//       must hang off params.requestId, and that request must belong to
//       params.id. Only then is the linked VisaApplication id trusted.
// Every denial is the same generic 404. Each successful view is audited.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertVisaDocumentAccessDenyingReferralPartners } from '@/lib/business/document-authz'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import { recordBusinessAudit } from '@/lib/business/audit'

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

  const access = await assertVisaDocumentAccessDenyingReferralPartners(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const service = await loadServiceInRequestInOrg(params.serviceId, params.requestId, params.id)
  if (!service || service.serviceType !== 'VISA' || !service.linkedVisaApplicationId) return NOT_FOUND()

  const [application, documents] = await Promise.all([
    prisma.visaApplication.findUnique({
      where: { id: service.linkedVisaApplicationId },
      select: { id: true, referenceNumber: true, firstName: true, lastName: true, destinationIso2: true, visaType: true, status: true, passportExpiryDate: true },
    }),
    prisma.visaCaseDocument.findMany({
      where: { applicationId: service.linkedVisaApplicationId },
      select: { id: true, documentType: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, scanStatus: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  if (!application) return NOT_FOUND()

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'visa_documents.viewed',
    entityType: 'TravelRequestService',
    entityId: service.id,
    after: { via: access.via ?? null, documentCount: documents.length },
  })

  return NextResponse.json({
    application: {
      reference: application.referenceNumber,
      applicantName: [application.firstName, application.lastName].filter(Boolean).join(' ') || null,
      destination: application.destinationIso2,
      visaType: application.visaType,
      status: application.status,
      passportExpiryDate: application.passportExpiryDate,
    },
    documents,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
