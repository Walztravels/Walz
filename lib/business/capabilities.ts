// lib/business/capabilities.ts — Walz Business (Release 2): explicit,
// additive membership capabilities.
//
// WHY THIS EXISTS
//   lib/business/authz.ts::assertSensitiveDocumentAccess() hardcodes visa/
//   passport-document access to ADMIN/OWNER and is deliberately NOT
//   parameterizable. Some organizations need a named travel coordinator to
//   see visa-case documents without making them an org ADMIN. R2 meets that
//   need WITHOUT loosening the baseline, via an explicit capability:
//
//     assertVisaDocumentAccess(userId, orgId) passes iff
//       (a) assertSensitiveDocumentAccess(userId, orgId) passes
//           (the unchanged ADMIN/OWNER baseline), OR
//       (b) the caller has an ACTIVE membership of orgId, whose role is not
//           the floor TRAVELLER role, AND that exact membership holds an
//           un-revoked VISA_DOCUMENTS_VIEW grant row for that exact org in
//           organization_membership_capabilities.
//
// INVARIANTS
//   - Never implicit from the org role: TRAVEL_MANAGER/APPROVER/FINANCE/
//     COORDINATOR get NOTHING without a grant row.
//   - Never implicit from any STAFF permission (e.g. visa_view_all) — that is
//     a different axis (Walz staff vs customer-org members) and this module
//     does not import or consult lib/admin/permissions at all.
//   - Grants are staff-only (b2b.manage), reason-required, audited, and
//     revocation is a soft stamp (append-only history) — see
//     app/api/admin/business/organizations/[id]/members/[membershipId]/capabilities/route.ts.
//   - Fail closed, generic 404 on every denial, fresh DB reads every call.

import prisma from '@/lib/db'
import { assertOrgScopedAccess, assertSensitiveDocumentAccess, type OrgAccessResult } from '@/lib/business/authz'

export const MEMBERSHIP_CAPABILITIES = ['VISA_DOCUMENTS_VIEW'] as const
export type MembershipCapability = (typeof MEMBERSHIP_CAPABILITIES)[number]

export function isMembershipCapability(v: unknown): v is MembershipCapability {
  return typeof v === 'string' && (MEMBERSHIP_CAPABILITIES as readonly string[]).includes(v)
}

// The floor role can never hold a document capability — a traveller must
// never be able to see OTHER travellers' visa documents.
export const CAPABILITY_INELIGIBLE_ROLES = ['TRAVELLER'] as const

const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

export async function hasActiveCapability(
  membershipId: string,
  organizationId: string,
  capability: MembershipCapability,
): Promise<boolean> {
  if (!membershipId || !organizationId) return false
  const grant = await prisma.organizationMembershipCapability.findFirst({
    where: { membershipId, organizationId, capability, revokedAt: null },
    select: { id: true },
  })
  return !!grant
}

export async function assertVisaDocumentAccess(
  userId: string,
  organizationId: string,
): Promise<OrgAccessResult & { via?: 'role_baseline' | 'explicit_capability' }> {
  // (a) Unchanged hardcoded baseline.
  const baseline = await assertSensitiveDocumentAccess(userId, organizationId)
  if (baseline.ok) return { ...baseline, via: 'role_baseline' }

  // (b) Explicit grant on an ACTIVE, non-floor membership of THIS org.
  const access = await assertOrgScopedAccess(userId, organizationId)
  if (!access.ok) return GENERIC_DENIAL
  if ((CAPABILITY_INELIGIBLE_ROLES as readonly string[]).includes(access.membership.role)) return GENERIC_DENIAL
  if (access.membership.organizationId !== organizationId) return GENERIC_DENIAL

  const granted = await hasActiveCapability(access.membership.id, organizationId, 'VISA_DOCUMENTS_VIEW')
  if (!granted) return GENERIC_DENIAL

  return { ...access, via: 'explicit_capability' }
}
