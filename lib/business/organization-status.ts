// lib/business/organization-status.ts — Walz Business (Release 1)
//
// Shared between app/api/admin/business/organizations/route.ts (creation,
// always ONBOARDING) and .../[id]/status/route.ts (the only other place
// Organization.status may ever be written). Kept in a plain lib module
// rather than exported from a route file, since Next.js route files may
// only export the specific handler/config names it recognizes.

export const VALID_STATUSES = ['LEAD', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']
export const CREATION_STATUS = 'ONBOARDING'
