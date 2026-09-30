// .../visa-documents/[documentId]/content/route.ts — Walz Business (R2.1)
//
// GET — the CONTENT-VIEW/DOWNLOAD surface (new in R2.1; no prior endpoint
// returned bytes/signed URLs to any customer-org member). Returns a
// short-lived, FORCE-DOWNLOAD signed URL — never inline-renderable.
//
// AUTHORIZATION: gated behind lib/business/capabilities.ts::
// assertVisaDocumentAccess() EXACTLY as-is (the existing VISA_DOCUMENTS_VIEW
// / ADMIN / OWNER baseline) — unchanged, un-broadened. Deliberately NOT
// auto-granted to ADMIN-by-org-role beyond that baseline, NOT to the Travel
// Manager, NOT to the request creator, and NOT to the uploader just because
// of that relationship — only the existing capability/baseline governs it.
// This is intentionally a STRICTER gate than the metadata GET route
// (.../visa-documents/route.ts), which is broadly available to ACTIVE
// members.
//
// UNTRUSTED FILE HANDLING: no inline preview, no automatic processing of
// file contents. The document's scanStatus is surfaced in the audit trail
// only, never used to block/allow access (no scanner exists yet — see
// VisaCaseDocument.scanStatus's schema comment).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertVisaDocumentAccess } from '@/lib/business/capabilities'
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

  // Unchanged, un-broadened baseline — the ONLY gate for document bytes.
  const access = await assertVisaDocumentAccess(session.user.id, params.id)
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
