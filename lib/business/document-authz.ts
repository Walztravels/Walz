// lib/business/document-authz.ts — Walz Business (Release 2.1, REMEDIATED):
// the three-way document-authorization split.
//
//   1. SUBMIT — can this membership submit documents/data for THIS
//      specific TravelRequestService/case it's actually working on? Scoped
//      to one case, not organization-wide. NOT a capability grant (this is
//      not the same axis as content visibility) — just "ACTIVE membership
//      of this org (not a REFERRAL_PARTNER org) + the service genuinely
//      hangs off this request in this org" (the standard prong-2 check).
//      See assertCanSubmitVisaDocuments() below.
//
//   2. METADATA / STATUS VISIBILITY — this route was RESTORED to its exact
//      pre-R2.1 (production `main`) boundary after an independent security
//      review rejected R2.1's original broadening (which had exposed
//      applicant identity, destination, visa type, status and passport
//      expiry to ANY ACTIVE member including the floor TRAVELLER role).
//      The .../visa-documents/route.ts GET route once again requires
//      lib/business/capabilities.ts::assertVisaDocumentAccess() exactly as
//      it did before this release — see assertVisaDocumentAccessDenyingReferralPartners()
//      below, which layers the REFERRAL_PARTNER deny-by-default gate IN
//      FRONT of that unchanged capability check (an AND, never a
//      substitute: this can only ever narrow who is admitted relative to
//      the original boundary, never widen it). A genuinely business-
//      friendly, non-sensitive status surface was built SEPARATELY — see
//      app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-status/route.ts
//      and lib/business/visa-status.ts — rather than by loosening this route.
//
//   3. CONTENT VIEW / DOWNLOAD — actual bytes / a signed URL. Gated behind
//      assertVisaDocumentAccessDenyingReferralPartners() below — the
//      UNCHANGED lib/business/capabilities.ts::assertVisaDocumentAccess()
//      baseline (VISA_DOCUMENTS_VIEW / ADMIN / OWNER), with the
//      REFERRAL_PARTNER org-type deny-by-default gate layered IN FRONT of
//      it as an ADDITIONAL, PRIOR check — NEVER a substitute for the
//      capability check. FIX (independent-review HIGH finding): the R2.1
//      content route originally called assertVisaDocumentAccess() alone,
//      with NO org-type check at all — meaning a REFERRAL_PARTNER
//      organization's ADMIN/OWNER, or any member holding a historical
//      VISA_DOCUMENTS_VIEW grant, could still retrieve visa document
//      CONTENT after (or even before) reclassification to
//      REFERRAL_PARTNER. That is now fixed: REFERRAL_PARTNER is denied
//      unconditionally, regardless of role, regardless of any existing
//      capability grant, regardless of who uploaded the file, and
//      regardless of the organization's PRIOR type. A stale/historical
//      capability grant can never survive or bypass this gate, because the
//      org-type check runs and is enforced BEFORE the capability check is
//      even reached (short-circuit on failure) — and even if it were
//      reordered, the composition is a strict AND, so a capability grant
//      alone can never satisfy it on its own.
//      Explicitly NOT auto-granted to ADMIN-by-org-role beyond what that
//      baseline already gives, NOT to the Travel Manager, NOT to the
//      request creator, and NOT to the uploader just because of that
//      relationship — only the existing capability/baseline (now
//      additionally gated by org-type) governs it.

import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { assertVisaDocumentAccess } from '@/lib/business/capabilities'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import type { OrgAccessResult } from '@/lib/business/authz'

const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

/**
 * THE composed gate for both the (restored) metadata route and the content
 * route: REFERRAL_PARTNER organizations are denied FIRST, unconditionally —
 * before the existing VISA_DOCUMENTS_VIEW/ADMIN/OWNER capability check ever
 * runs. This is a pure narrowing (AND) of the original, unchanged
 * assertVisaDocumentAccess() behavior: it can only ever deny MORE than that
 * function alone would, never admit anyone assertVisaDocumentAccess() would
 * not already admit. A REFERRAL_PARTNER organization can NEVER pass this
 * gate no matter what role, grant, or upload history exists on that org.
 */
export async function assertVisaDocumentAccessDenyingReferralPartners(
  userId: string,
  organizationId: string,
): Promise<OrgAccessResult & { via?: 'role_baseline' | 'explicit_capability' }> {
  // Layer 1 — org-type gate, evaluated and enforced FIRST. Short-circuits
  // before the capability table (organization_membership_capabilities) is
  // ever queried, so a historical/stale grant on a since-reclassified
  // REFERRAL_PARTNER organization is never even looked up, let alone
  // honored.
  const orgTypeGate = await assertAgencyOrCorporateAccess(userId, organizationId)
  if (!orgTypeGate.ok) return orgTypeGate

  // Layer 2 — the existing, UNCHANGED capability/baseline check.
  return assertVisaDocumentAccess(userId, organizationId)
}

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
