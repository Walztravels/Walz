// lib/business/authz.ts — Walz Business (Release 1): THE authorization gate.
//
// Every API route under app/api/business/** and app/api/admin/business/**
// that touches an Organization-scoped resource MUST call
// assertOrgScopedAccess() (or assertSensitiveDocumentAccess() for visa/
// passport documents) as its first authorization step, immediately after
// the session check. No route may query OrganizationMembership directly to
// decide access.
//
// FAIL-CLOSED CONTRACT
//   - The membership row is read fresh from the DB on every single call.
//     A client-supplied role, status, or organizationId is NEVER trusted —
//     there is no parameter for any of them on this function.
//   - No membership row at all, or a membership whose status !== 'ACTIVE'
//     (INVITED / SUSPENDED / REMOVED), produces the exact same outcome:
//     { ok: false, status: 404, error: 'Not found' }. This is deliberate —
//     it mirrors the "every failure mode collapses to one generic response,
//     no enumeration oracle" pattern already established in this codebase:
//       - lib/jade-club/verify.ts: invalid_token / not_found / stale_token
//         all collapse to one indistinguishable public response.
//       - app/api/quote-proposal/[token]/route.ts: a wrong, expired, or
//         never-issued token never reveals which case applies.
//     Applied here: a non-member of organization X gets the identical 404
//     whether X exists and is ACTIVE (but they're not on it), X is
//     SUSPENDED/CLOSED, or X never existed at all. There is no way to use
//     this helper to enumerate organizations or probe their existence.
//
// ROLE ORDERING — a documented judgment call, not user-configurable
//
//   OWNER (100) > ADMIN (80) > TRAVEL_MANAGER ≈ APPROVER ≈ FINANCE (60)
//     > COORDINATOR (40) > TRAVELLER (20)
//
//   Reasoning:
//   - OWNER and ADMIN are the two organization-administration tiers
//     (billing/legal identity, membership management, sensitive documents)
//     and are kept strictly ordered above every other role.
//   - TRAVEL_MANAGER, APPROVER, and FINANCE are modelled as ONE peer
//     "management" tier with no further ranking among them. Each owns a
//     distinct business function (arranging travel, deciding approvals,
//     handling money) rather than a rung on a single chain of command, so
//     none of the three should out-rank the others. The practical
//     consequence — worth stating plainly — is that `minRole: 'APPROVER'`
//     also admits FINANCE and TRAVEL_MANAGER members, and `minRole:
//     'TRAVEL_MANAGER'` also admits APPROVER and FINANCE members. If a
//     later release needs strict role-EXCLUSIVITY (e.g. "only a member
//     whose role is literally APPROVER may decide an approval"), that is a
//     separate `membership.role === 'APPROVER'` equality check layered on
//     top of this helper's result — it is not a change to this ordering.
//   - COORDINATOR is an operational-support role (booking administration,
//     no approval or finance authority) ranked below the management tier
//     but above the base member.
//   - TRAVELLER is the floor: a member who can be the subject of travel
//     arranged for them, with no management authority over the
//     organization at all.
//
// SENSITIVE DOCUMENTS — locked product decision, never configurable
//   Visa/passport documents are visible to ADMIN/OWNER ONLY by default.
//   TRAVEL_MANAGER does NOT get this by default, regardless of the role
//   ordering above. assertSensitiveDocumentAccess() hardcodes this check
//   and does not accept a minRole parameter — it can never be configured
//   to allow any other role, including via a future TRAVEL_MANAGER-favoring
//   change to the ordering above.

import prisma from '@/lib/db'
import type { OrganizationMembership } from '@prisma/client'

export type OrgRole =
  | 'OWNER'
  | 'ADMIN'
  | 'TRAVEL_MANAGER'
  | 'APPROVER'
  | 'FINANCE'
  | 'COORDINATOR'
  | 'TRAVELLER'

// See the module header for the reasoning behind these specific numbers.
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  TRAVEL_MANAGER: 60,
  APPROVER: 60,
  FINANCE: 60,
  COORDINATOR: 40,
  TRAVELLER: 20,
}

function isKnownOrgRole(role: string): role is OrgRole {
  return Object.prototype.hasOwnProperty.call(ORG_ROLE_RANK, role)
}

// Exported so other modules (e.g. lib/business/invitations.ts) validate a
// caller-supplied role string against the exact same allow-list as this
// gate, rather than maintaining a second copy of the role list.
export const isOrgRole = isKnownOrgRole
export const ALL_ORG_ROLES = Object.keys(ORG_ROLE_RANK) as OrgRole[]

const ACTIVE_STATUS = 'ACTIVE'

// Always the exact same shape and text — see "FAIL-CLOSED CONTRACT" above.
// Never parameterize this with a reason; that would reopen the enumeration
// oracle this function exists to close.
const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

export type OrgAccessResult =
  | { ok: true; membership: OrganizationMembership }
  | { ok: false; status: number; error: string }

export async function assertOrgScopedAccess(
  userId: string,
  organizationId: string,
  opts?: { minRole?: OrgRole },
): Promise<OrgAccessResult> {
  if (!userId || !organizationId) return GENERIC_DENIAL

  // Fresh read, every call — never trust a caller-supplied role/status.
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })

  if (!membership) return GENERIC_DENIAL
  if (membership.status !== ACTIVE_STATUS) return GENERIC_DENIAL

  if (opts?.minRole) {
    const requiredRank = ORG_ROLE_RANK[opts.minRole]
    const memberRank = isKnownOrgRole(membership.role) ? ORG_ROLE_RANK[membership.role] : 0
    if (memberRank < requiredRank) return GENERIC_DENIAL
  }

  return { ok: true, membership }
}

// RELEASE 2 — the invite-accept gate. The ONLY sanctioned way to read an
// INVITED membership for an authorization decision (assertOrgScopedAccess
// deliberately denies anything not ACTIVE). Same fail-closed contract:
//   - keyed ONLY on the (organizationId, session userId) pair — a caller can
//     only ever reach their OWN invitation, never someone else's, and never
//     one in a different organization;
//   - fresh DB read every call;
//   - no row / any status other than INVITED -> the identical GENERIC_DENIAL.
export async function assertPendingInvitation(
  userId: string,
  organizationId: string,
): Promise<OrgAccessResult> {
  if (!userId || !organizationId) return GENERIC_DENIAL

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })

  if (!membership) return GENERIC_DENIAL
  if (membership.userId !== userId || membership.organizationId !== organizationId) return GENERIC_DENIAL
  if (membership.status !== 'INVITED') return GENERIC_DENIAL

  return { ok: true, membership }
}

// Hardcoded to ADMIN/OWNER — see "SENSITIVE DOCUMENTS" above. Do not add a
// minRole/role parameter to this function; that would make the locked
// product decision configurable, which it must never be.
export async function assertSensitiveDocumentAccess(
  userId: string,
  organizationId: string,
): Promise<OrgAccessResult> {
  const result = await assertOrgScopedAccess(userId, organizationId)
  if (!result.ok) return result

  if (result.membership.role !== 'ADMIN' && result.membership.role !== 'OWNER') {
    return GENERIC_DENIAL
  }

  return result
}
