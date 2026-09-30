// lib/business/organization-type.ts — Walz Business (Release 2.1)
//
// The closed list of organization types. Kept in a plain lib module so the
// creation route, the dedicated organization-type transition route, the
// referral-partner deny-by-default gate, and the admin UI share one source
// of truth — mirrors lib/business/currency.ts and
// lib/business/organization-status.ts exactly.
//
// R2.1 RULES
//   - Every Organization defaults to CORPORATE (schema default + migration
//     backfill — see prisma/migrations/walz_business_r2_1.sql).
//   - An EXISTING organization's type only ever changes through
//     app/api/admin/business/organizations/[id]/organization-type/route.ts
//     (b2b.manage + mandatory reason + before/after audit). No other route
//     writes Organization.organizationType — a bare field update must never
//     be reachable through any other route.

export const VALID_ORGANIZATION_TYPES = ['CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER'] as const
export type OrganizationType = (typeof VALID_ORGANIZATION_TYPES)[number]

export const DEFAULT_ORGANIZATION_TYPE: OrganizationType = 'CORPORATE'

export function isOrganizationType(value: unknown): value is OrganizationType {
  return typeof value === 'string' && (VALID_ORGANIZATION_TYPES as readonly string[]).includes(value)
}

export function parseOrganizationType(value: unknown): OrganizationType | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return isOrganizationType(normalized) ? normalized : null
}
