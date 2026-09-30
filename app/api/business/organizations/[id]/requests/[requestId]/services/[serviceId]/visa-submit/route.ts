// app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-submit/route.ts
// Walz Business (Release 2.1) — agency visa-workflow intake, all three
// modes, all converging on ONE VisaApplication.
//
// mode=FORM            — agency fills the visa form on behalf of a client.
// mode=CLIENT_DOCS      — agency uploads documents the client collected.
// mode=AGENCY_COMPLETED — agency uploads its own completed form + docs.
//
// All three converge on the existing VisaApplication via the existing
// TravelRequestService.linkedVisaApplicationId mechanism (never a new
// B2BVisaApplication table). Documents go through storeCaseDocument() ->
// VisaCaseDocument exclusively (never the legacy PortalDocument path).
//
// AUTHORIZATION: lib/business/document-authz.ts::assertCanSubmitVisaDocuments
// — a SCOPED check (ACTIVE membership of this org, not REFERRAL_PARTNER,
// service genuinely a VISA service of this request/org). This is
// deliberately NOT the VISA_DOCUMENTS_VIEW capability — submitting is not
// the same axis as viewing stored content.
//
// ATTESTATION: a strict `attested === true` gate (lib/business/
// attestation.ts, modeled on lib/consent/capture.ts) is required BEFORE any
// data or document is written — no partial writes on a missing/false
// attestation. Every submission writes exactly one append-only
// TravelRequestServiceAttestation row recording WHO (membershipId) actually
// submitted the information, server-captured IP/UA, and a placeholder
// version string (no finalized legal wording).
//
// UNTRUSTED FILE HANDLING: no new validation beyond what storeCaseDocument()
// already does (type/size/checksum) — VisaCaseDocument.scanStatus defaults
// to SCAN_UNAVAILABLE (no scanner exists). Files are never rendered inline;
// see the content-download route for forced attachment disposition.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { assertCanSubmitVisaDocuments } from '@/lib/business/document-authz'
import { recordServiceAttestation, extractRequestIp } from '@/lib/business/attestation'
import { recordBusinessAudit } from '@/lib/business/audit'
import { storeCaseDocument } from '@/lib/intelligence/document-store'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const SUBMIT_MODES = ['FORM', 'CLIENT_DOCS', 'AGENCY_COMPLETED'] as const

function generateVisaReference(): string {
  return `B2B-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertCanSubmitVisaDocuments(session.user.id, params.id, params.requestId, params.serviceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form submission' }, { status: 400 })
  }

  const mode = String(formData.get('mode') ?? '')
  if (!(SUBMIT_MODES as readonly string[]).includes(mode)) {
    return NextResponse.json({ error: `mode must be one of: ${SUBMIT_MODES.join(', ')}` }, { status: 400 })
  }

  // Strict boolean gate — ONLY the literal string 'true' counts, mirroring
  // lib/consent/capture.ts's strict `=== true` discipline transported
  // through a form field. Anything else is treated as not-attested and
  // blocks every write below.
  const attestedRaw = formData.get('attested')
  const attested: boolean = attestedRaw === 'true'
  if (!attested) {
    return NextResponse.json({ error: 'Attestation is required before submitting' }, { status: 400 })
  }

  const service = access.service

  // Resolve (or create) the linked VisaApplication. Every intake mode
  // converges here.
  let visaApplicationId = service.linkedVisaApplicationId

  if (!visaApplicationId) {
    // Fall back to the request's first linked traveller for a name/email
    // default — never required to already exist.
    const travellerLink = await prisma.travelRequestTraveller.findFirst({
      where: { travelRequestId: params.requestId },
      include: { businessTraveller: { select: { firstName: true, lastName: true, email: true, userId: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const formFieldsRaw = formData.get('formFields')
    let formFields: Record<string, unknown> = {}
    if (typeof formFieldsRaw === 'string' && formFieldsRaw) {
      try { formFields = JSON.parse(formFieldsRaw) } catch { /* ignore malformed JSON, fall back to traveller defaults */ }
    }

    const destinationIso2 = typeof formFields.destinationIso2 === 'string' && formFields.destinationIso2.trim()
      ? formFields.destinationIso2.trim().toUpperCase().slice(0, 2)
      : null
    if (!destinationIso2) {
      return NextResponse.json({ error: 'destinationIso2 is required to start a new visa case' }, { status: 400 })
    }

    const created = await prisma.visaApplication.create({
      data: {
        referenceNumber: generateVisaReference(),
        destinationIso2,
        visaType: typeof formFields.visaType === 'string' && formFields.visaType.trim() ? formFields.visaType.trim() : 'tourist',
        firstName: typeof formFields.firstName === 'string' ? formFields.firstName.trim() : travellerLink?.businessTraveller.firstName ?? null,
        lastName: typeof formFields.lastName === 'string' ? formFields.lastName.trim() : travellerLink?.businessTraveller.lastName ?? null,
        email: typeof formFields.email === 'string' ? formFields.email.trim().toLowerCase() : travellerLink?.businessTraveller.email ?? null,
        userId: travellerLink?.businessTraveller.userId ?? null,
        status: 'draft',
      },
      select: { id: true },
    })
    visaApplicationId = created.id

    // Freshly created — no exclusivity/ownership-gate check is needed here
    // (unlike lib/business/services.ts's staff-only cross-record linking):
    // this row cannot already belong to another organization, since this
    // endpoint just created it.
    await prisma.travelRequestService.update({
      where: { id: service.id },
      data: { linkedVisaApplicationId: visaApplicationId },
    })
  }

  const documentsStored: string[] = []

  if (mode === 'CLIENT_DOCS' || mode === 'AGENCY_COMPLETED') {
    const files = formData.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required for this submission mode' }, { status: 400 })
    }
    const documentType = mode === 'AGENCY_COMPLETED' ? 'agency_completed_form' : 'client_collected_document'
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const stored = await storeCaseDocument({
        applicationId: visaApplicationId,
        documentType,
        fileName: file.name,
        mimeType: file.type,
        buffer,
        uploadedBy: session.user.email ?? session.user.id,
      })
      if (!stored.ok) {
        return NextResponse.json({ error: stored.error }, { status: 400 })
      }
      if (stored.doc.documentId) documentsStored.push(stored.doc.documentId)
    }
  }

  // Append-only attestation — recorded for every successful submission
  // regardless of mode, capturing WHO submitted it.
  const attestation = await recordServiceAttestation({
    travelRequestServiceId: service.id,
    organizationId: params.id,
    membershipId: access.membership.id,
    visaApplicationId,
    attested,
    ipAddress: extractRequestIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'visa_submission.received',
    entityType: 'TravelRequestService',
    entityId: service.id,
    after: {
      mode,
      visaApplicationId,
      documentCount: documentsStored.length,
      attested: attestation.recorded,
    },
  })

  return NextResponse.json(
    { ok: true, visaApplicationId, documentsStored: documentsStored.length, attested: attestation.recorded },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
