// lib/business/visa-intake.ts — Walz Business (V1-C Phase 1 extraction):
// the authorization-agnostic DOMAIN logic shared by every caller that
// submits visa intake information for a TravelRequestService — today only
// the existing authenticated-member route
// (app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-submit/route.ts),
// and in a LATER phase (not built here) an anonymous-link recipient route.
//
// WHAT MOVED HERE vs. WHAT STAYED IN THE ROUTE (do not blur this line):
//   MOVED    — resolve-or-create the VisaApplication (via
//              TravelRequestService.linkedVisaApplicationId), validate/apply
//              the form fields that start a new case, store uploaded files
//              via storeCaseDocument().
//   STAYED   — session/authentication, assertCanSubmitVisaDocuments()
//              authorization, mode validation, the strict `attested === true`
//              gate, recordServiceAttestation() (writes
//              TravelRequestServiceAttestation.membershipId, NOT NULL,
//              onDelete: Restrict — there is no membership to write for an
//              anonymous-link submitter), recordBusinessAudit(), and the
//              route's exact request/response contract.
//
// This function NEVER performs authentication or authorization — callers
// must have already established the caller is allowed to submit for this
// exact service before calling it. It never writes
// TravelRequestServiceAttestation (callers that have a membershipId do that
// themselves, exactly as the pre-refactor route did); for the
// `kind: 'anonymous_link'` case there is no membership to attest with, so
// attestation is simply never attempted for that path — not "skipped" by a
// conditional inside this function, but structurally absent because this
// function was never the one writing it.
//
// submittedBy exists so a LATER phase's anonymous-link caller can identify
// itself without this function ever branching on membership vs. anonymous
// internally in Phase 1 — the shape is accepted now so that caller can be
// added later WITHOUT another refactor of this function's signature.

import prisma from '@/lib/db'
import crypto from 'crypto'
import { storeCaseDocument } from '@/lib/intelligence/document-store'
import { checkLength, FIELD_LIMITS, isValidIso2 } from '@/lib/business/validation'

export const VISA_INTAKE_MODES = ['FORM', 'CLIENT_DOCS', 'AGENCY_COMPLETED'] as const
export type VisaIntakeMode = (typeof VISA_INTAKE_MODES)[number]

export function isVisaIntakeMode(v: unknown): v is VisaIntakeMode {
  return typeof v === 'string' && (VISA_INTAKE_MODES as readonly string[]).includes(v)
}

// Discriminated identity of whoever is submitting. Phase 1 only ever
// constructs the 'member' variant (from the existing authenticated route).
// The 'anonymous_link' variant's shape is defined now so the later
// recipient-facing route can be added without changing this function's
// signature again — no caller constructs it yet.
export type VisaIntakeSubmittedBy =
  | { kind: 'member'; membershipId: string }
  | { kind: 'anonymous_link'; businessTravellerId: string; linkTokenId: string }

export interface SubmitVisaIntakeInput {
  organizationId: string
  travelRequestId: string
  serviceId: string
  linkedVisaApplicationId: string | null
  mode: VisaIntakeMode
  formFields: Record<string, unknown>
  files: File[]
  uploadedBy: string
  submittedBy: VisaIntakeSubmittedBy
}

export type SubmitVisaIntakeResult =
  | { ok: true; visaApplicationId: string; documentsStored: string[] }
  | { ok: false; status: number; error: string }

function generateVisaReference(): string {
  return `B2B-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

/**
 * Resolves (or creates) the linked VisaApplication for one
 * TravelRequestService, then stores any uploaded documents against it.
 * Returns the SAME error shapes/messages the pre-extraction route returned
 * inline, byte-for-byte, so the wrapping route's response contract is
 * unchanged — see __tests__/business-r2-1-visa-submit.test.ts, which is run
 * UNCHANGED against the refactored route to prove this.
 */
export async function submitVisaIntake(input: SubmitVisaIntakeInput): Promise<SubmitVisaIntakeResult> {
  let visaApplicationId = input.linkedVisaApplicationId

  if (!visaApplicationId) {
    // Fall back to the request's first linked traveller for a name/email
    // default — never required to already exist.
    const travellerLink = await prisma.travelRequestTraveller.findFirst({
      where: { travelRequestId: input.travelRequestId },
      include: { businessTraveller: { select: { firstName: true, lastName: true, email: true, userId: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const formFields = input.formFields

    // B6 remediation: destinationIso2 is validated strictly as a real
    // ISO-3166-1 alpha-2 code — a 3-letter code (or anything else
    // malformed) is REJECTED, never silently truncated down to 2 chars
    // (which would silently change the destination to a wrong country).
    const destinationIso2Raw = typeof formFields.destinationIso2 === 'string' ? formFields.destinationIso2.trim().toUpperCase() : ''
    if (!destinationIso2Raw) {
      return { ok: false, status: 400, error: 'destinationIso2 is required to start a new visa case' }
    }
    if (!isValidIso2(destinationIso2Raw)) {
      return { ok: false, status: 400, error: 'destinationIso2 must be a 2-letter ISO-3166-1 country code' }
    }
    const destinationIso2 = destinationIso2Raw

    const visaType = typeof formFields.visaType === 'string' && formFields.visaType.trim() ? formFields.visaType.trim() : 'tourist'
    const firstName = typeof formFields.firstName === 'string' ? formFields.firstName.trim() : (travellerLink?.businessTraveller.firstName ?? null)
    const lastName = typeof formFields.lastName === 'string' ? formFields.lastName.trim() : (travellerLink?.businessTraveller.lastName ?? null)
    const email = typeof formFields.email === 'string' ? formFields.email.trim().toLowerCase() : (travellerLink?.businessTraveller.email ?? null)

    // B6 remediation: real server-side length caps on every agency-
    // submitted field — REJECT, never silently truncate.
    for (const [label, value, max] of [
      ['visaType', visaType, FIELD_LIMITS.VISA_TYPE],
      ...(firstName ? [['firstName', firstName, FIELD_LIMITS.PERSON_NAME]] as const : []),
      ...(lastName ? [['lastName', lastName, FIELD_LIMITS.PERSON_NAME]] as const : []),
      ...(email ? [['email', email, FIELD_LIMITS.EMAIL]] as const : []),
    ] as const) {
      const check = checkLength(value, label, max)
      if (!check.ok) return { ok: false, status: 400, error: check.error! }
    }

    const created = await prisma.visaApplication.create({
      data: {
        referenceNumber: generateVisaReference(),
        destinationIso2,
        visaType,
        firstName,
        lastName,
        email,
        userId: travellerLink?.businessTraveller.userId ?? null,
        status: 'draft',
      },
      select: { id: true },
    })
    visaApplicationId = created.id

    // Freshly created — no exclusivity/ownership-gate check is needed here
    // (unlike lib/business/services.ts's staff-only cross-record linking):
    // this row cannot already belong to another organization, since this
    // function just created it.
    await prisma.travelRequestService.update({
      where: { id: input.serviceId },
      data: { linkedVisaApplicationId: visaApplicationId },
    })
  }

  const documentsStored: string[] = []

  if (input.mode === 'CLIENT_DOCS' || input.mode === 'AGENCY_COMPLETED') {
    if (input.files.length === 0) {
      return { ok: false, status: 400, error: 'At least one file is required for this submission mode' }
    }
    const documentType = input.mode === 'AGENCY_COMPLETED' ? 'agency_completed_form' : 'client_collected_document'
    for (const file of input.files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const stored = await storeCaseDocument({
        applicationId: visaApplicationId,
        documentType,
        fileName: file.name,
        mimeType: file.type,
        buffer,
        uploadedBy: input.uploadedBy,
      })
      if (!stored.ok) {
        return { ok: false, status: 400, error: stored.error }
      }
      if (stored.doc.documentId) documentsStored.push(stored.doc.documentId)
    }
  }

  return { ok: true, visaApplicationId, documentsStored }
}
