// lib/business/document-authz.ts — Walz Business (Release 2.1): the
// three-way document-authorization split.
//
//   1. SUBMIT — can this membership submit documents/data for THIS
//      specific TravelRequestService/case it's actually working on? Scoped
//      to one case, not organization-wide. NOT a capability grant (this is
//      not the same axis as content visibility) — just "ACTIVE membership
//      of this org (not a REFERRAL_PARTNER org) + the service genuinely
//      hangs off this request in this org" (the standard prong-2 check).
//      See assertCanSubmitVisaDocuments() below.
//
//   2. METADATA / STATUS VISIBILITY — document exists, type, filename,
//      size, date. Broadly available to relevant ACTIVE members (any role)
//      — this is deliberately NOT gated behind VISA_DOCUMENTS_VIEW. See the
//      (unchanged-shape, now-broadened) GET .../visa-documents/route.ts.
//
//   3. CONTENT VIEW / DOWNLOAD — actual bytes / a signed URL. This is the
//      new, narrow surface. Gated behind
//      lib/business/capabilities.ts::assertVisaDocumentAccess() EXACTLY
//      as-is (the existing VISA_DOCUMENTS_VIEW / ADMIN / OWNER baseline).
//      Explicitly NOT auto-granted to ADMIN-by-org-role beyond what that
//      baseline already gives, NOT to the Travel Manager, NOT to the
//      request creator, and NOT to the uploader just because of that
//      relationship — only the existing capability/baseline governs it.
//      Routes needing this call assertVisaDocumentAccess() directly; this
//      module does not re-wrap it (a re-wrap risks silently loosening it).

import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import type { OrgAccessResult } from '@/lib/business/authz'

const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

export type SubmitAccessResult =
  | (Extract<OrgAccessResult, { ok: true }> & { service: NonNullable<Awaited<ReturnType<typeof loadServiceInRequestInOrg>>> })
  | { ok: false; status: number; error: string }

/**
 * The SUBMIT gate. ACTIVE membership of this org (REFERRAL_PARTNER orgs are
 * denied here too — visa/document endpoints are on their explicit deny
 * list), and the service must genuinely be a VISA service hanging off this
 * exact request in this exact organization (standard prong-2 check).
 * Deliberately does NOT consult VISA_DOCUMENTS_VIEW or any capability —
 * submitting information for a case you are working on is a different
 * question from being allowed to later VIEW the stored content.
 */
export async function assertCanSubmitVisaDocuments(
  userId: string,
  organizationId: string,
  requestId: string,
  serviceId: string,
): Promise<SubmitAccessResult> {
  const access = await assertAgencyOrCorporateAccess(userId, organizationId)
  if (!access.ok) return access

  const service = await loadServiceInRequestInOrg(serviceId, requestId, organizationId)
  if (!service || service.serviceType !== 'VISA') return GENERIC_DENIAL

  return { ...access, service }
}
