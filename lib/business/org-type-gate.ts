// lib/business/org-type-gate.ts — Walz Business (Release 2.1): the
// REFERRAL_PARTNER deny-by-default gate.
//
// LAYERED ON TOP OF, NOT REPLACING, lib/business/authz.ts::
// assertOrgScopedAccess(). A REFERRAL_PARTNER-type organization's members
// must never reach:
//   - agency/corporate client-traveller management
//   - any VisaApplication/visa-document endpoint
//   - corporate employee management
//   - any booking/service-ownership endpoint
//
// DEFAULT DENY, EXPLICIT ALLOW-LIST ONLY. The only sanctioned action for a
// REFERRAL_PARTNER member is viewing their own referral attribution — see
// app/api/business/organizations/[id]/referral/route.ts, which does NOT use
// this gate (it is the allow-listed exception, not a denial surface).
//
// Fail-closed contract identical to authz.ts: the exact same generic 404,
// fresh DB read every call, no client-supplied organizationType ever
// trusted.

import prisma from '@/lib/db'
import { assertOrgScopedAccess, type OrgAccessResult, type OrgRole } from '@/lib/business/authz'

const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

/**
 * Use this in place of assertOrgScopedAccess() on every route in the
 * explicit deny-list above. It performs the exact same membership/role
 * check, then ADDITIONALLY denies (with the identical generic response —
 * no distinguishable signal) when the organization's type is
 * REFERRAL_PARTNER.
 */
export async function assertAgencyOrCorporateAccess(
  userId: string,
  organizationId: string,
  opts?: { minRole?: OrgRole },
): Promise<OrgAccessResult> {
  const access = await assertOrgScopedAccess(userId, organizationId, opts)
  if (!access.ok) return access

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { organizationType: true },
  })
  if (!organization) return GENERIC_DENIAL
  if (organization.organizationType === 'REFERRAL_PARTNER') return GENERIC_DENIAL

  return access
}
