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
//
// V1-C PHASE 1 REFACTOR: this route is now a THIN WRAPPER around
// lib/business/visa-intake.ts::submitVisaIntake(), which holds the
// authorization-agnostic domain logic (resolve-or-create the
// VisaApplication, store files). Authentication, authorization
// (assertCanSubmitVisaDocuments — UNCHANGED, still called here, not moved),
// the attestation gate/write (recordServiceAttestation — UNCHANGED, still
// called here), the audit call, and the request/response contract are ALL
// UNCHANGED from before this refactor. See
// __tests__/business-r2-1-visa-submit.test.ts, which is run UNMODIFIED
// against this refactored route as proof of byte-identical behavior.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertCanSubmitVisaDocuments } from '@/lib/business/document-authz'
import { recordServiceAttestation, extractRequestIp } from '@/lib/business/attestation'
import { recordBusinessAudit } from '@/lib/business/audit'
import { submitVisaIntake } from '@/lib/business/visa-intake'

export const dynamic = 'force-dynamic'

const SUBMIT_MODES = ['FORM', 'CLIENT_DOCS', 'AGENCY_COMPLETED'] as const

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

  const formFieldsRaw = formData.get('formFields')
  let formFields: Record<string, unknown> = {}
  if (typeof formFieldsRaw === 'string' && formFieldsRaw) {
    try { formFields = JSON.parse(formFieldsRaw) } catch { /* ignore malformed JSON, fall back to traveller defaults */ }
  }
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)

  // Domain logic (resolve-or-create the VisaApplication, store files) lives
  // in the shared, authorization-agnostic lib/business/visa-intake.ts —
  // authentication/authorization (above) and attestation/audit (below) stay
  // here, UNCHANGED from before this extraction.
  const result = await submitVisaIntake({
    organizationId: params.id,
    travelRequestId: params.requestId,
    serviceId: service.id,
    linkedVisaApplicationId: service.linkedVisaApplicationId,
    mode: mode as 'FORM' | 'CLIENT_DOCS' | 'AGENCY_COMPLETED',
    formFields,
    files,
    uploadedBy: session.user.email ?? session.user.id,
    submittedBy: { kind: 'member', membershipId: access.membership.id },
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { visaApplicationId, documentsStored } = result

  // Append-only attestation — recorded for every successful submission
  // regardless of mode, capturing WHO submitted it. UNCHANGED: this route
  // (never the shared function) writes TravelRequestServiceAttestation,
  // because that write requires a membershipId that only an authenticated
  // member's session can provide.
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
