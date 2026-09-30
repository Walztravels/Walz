// .../visa-documents/[documentId]/content/route.ts — Walz Business (R2.1,
// REMEDIATED after an independent-review HIGH finding)
//
// GET — the CONTENT-VIEW/DOWNLOAD surface (new in R2.1; no prior endpoint
// returned bytes/signed URLs to any customer-org member). Returns a
// short-lived, FORCE-DOWNLOAD signed URL — never inline-renderable.
//
// AUTHORIZATION: gated behind lib/business/document-authz.ts::
// assertVisaDocumentAccessDenyingReferralPartners() — the UNCHANGED
// lib/business/capabilities.ts::assertVisaDocumentAccess() baseline
// (VISA_DOCUMENTS_VIEW / ADMIN / OWNER), with the REFERRAL_PARTNER
// deny-by-default org-type gate layered IN FRONT of it, as an ADDITIONAL
// PRIOR check, NEVER a substitute.
//
// FIX (HIGH, confirmed by independent review): this route originally called
// assertVisaDocumentAccess() alone, with NO organization-type check at all.
// That meant a REFERRAL_PARTNER organization's ADMIN/OWNER — or any member
// holding a VISA_DOCUMENTS_VIEW grant issued back when the org was still
// CORPORATE/TRAVEL_AGENCY — could still retrieve visa document CONTENT after
// reclassification. Fixed: REFERRAL_PARTNER is now denied unconditionally,
// regardless of role, regardless of any existing/historical capability
// grant, regardless of who uploaded the file, and regardless of the
// organization's prior type. The org-type check runs and is enforced BEFORE
// the capability table is ever queried, so a stale grant can never even be
// looked up, let alone bypass this gate — and the composition is a strict
// AND in any case, so a capability grant alone could never satisfy it.
//
// This is intentionally a STRICTER gate than the (restored, pre-R2.1)
// metadata GET route (.../visa-documents/route.ts), which requires the same
// composed gate but the SAME capability baseline as this route — the two
// routes are equally protected; content additionally forces a download
// disposition and never inline-renders.
//
// UNTRUSTED FILE HANDLING: no inline preview, no automatic processing of
// file contents. The document's scanStatus is surfaced in the audit trail
// only, never used to block/allow access (no scanner exists yet — see
// VisaCaseDocument.scanStatus's schema comment).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertVisaDocumentAccessDenyingReferralPartners } from '@/lib/business/document-authz'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import { recordBusinessAudit } from '@/lib/business/audit'
import { signedDocumentUrl } from '@/lib/intelligence/document-store'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string; documentId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Layer 1 (org-type, enforced first) + Layer 2 (unchanged capability
  // baseline) — see module header and lib/business/document-authz.ts.
  const access = await assertVisaDocumentAccessDenyingReferralPartners(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const service = await loadServiceInRequestInOrg(params.serviceId, params.requestId, params.id)
  if (!service || service.serviceType !== 'VISA' || !service.linkedVisaApplicationId) return NOT_FOUND()

  const document = await prisma.visaCaseDocument.findUnique({
    where: { id: params.documentId },
    select: { id: true, applicationId: true, storagePath: true, fileName: true, mimeType: true, scanStatus: true },
  })
  // The document must belong to the exact VisaApplication linked to THIS
  // service — never trust documentId alone (would allow cross-case/
  // cross-org document access by id guessing).
  if (!document || document.applicationId !== service.linkedVisaApplicationId) return NOT_FOUND()

  const url = await signedDocumentUrl(document.storagePath, 600, document.fileName)
  if (!url) return NextResponse.json({ error: 'The document could not be retrieved — please try again' }, { status: 500 })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'visa_document_content.viewed',
    entityType: 'VisaCaseDocument',
    entityId: document.id,
    after: { via: access.via ?? null, scanStatus: document.scanStatus },
  })

  return NextResponse.json(
    { url, expiresInSeconds: 600, fileName: document.fileName, scanStatus: document.scanStatus },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
