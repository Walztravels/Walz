// lib/jade-club/commercial-types.ts — Jade Travel Club Release 2A: shared
// commercial/entitlement types.
//
// TypeScript-side enforcement layer mirroring the DB CHECK-style values
// used across prisma/migrations/jade_travel_club_commercial_v2a.sql (this
// repo's convention: TEXT column + validated-in-TypeScript union, not a
// native Postgres enum — see lib/jade-club/types.ts's header for why).

// Commercial policies only ever exist for a PAID tier — Free has no policy.
export const JADE_COMMERCIAL_TIERS = ['CLUB', 'CLUB_PLUS'] as const
export type JadeCommercialTier = (typeof JADE_COMMERCIAL_TIERS)[number]

export const JADE_POLICY_STATUSES = ['DRAFT', 'ACTIVE', 'SUPERSEDED'] as const
export type JadePolicyStatus = (typeof JADE_POLICY_STATUSES)[number]

export const JADE_ENTITLEMENT_TYPES = ['COUNT_PER_PERIOD', 'COST_CAPPED', 'BOOLEAN_ELIGIBILITY'] as const
export type JadeEntitlementType = (typeof JADE_ENTITLEMENT_TYPES)[number]

export const JADE_SLOT_STATUSES = ['AVAILABLE', 'RESERVED', 'CONSUMED', 'REVERSED'] as const
export type JadeSlotStatus = (typeof JADE_SLOT_STATUSES)[number]

export const JADE_ENTITLEMENT_EVENT_TYPES = [
  'ISSUED', 'RESERVED', 'RESERVATION_RELEASED', 'CONSUMED', 'REVERSED',
] as const
export type JadeEntitlementEventType = (typeof JADE_ENTITLEMENT_EVENT_TYPES)[number]

export function isJadeCommercialTier(value: unknown): value is JadeCommercialTier {
  return typeof value === 'string' && (JADE_COMMERCIAL_TIERS as readonly string[]).includes(value)
}

export function isJadePolicyStatus(value: unknown): value is JadePolicyStatus {
  return typeof value === 'string' && (JADE_POLICY_STATUSES as readonly string[]).includes(value)
}

export function isJadeEntitlementType(value: unknown): value is JadeEntitlementType {
  return typeof value === 'string' && (JADE_ENTITLEMENT_TYPES as readonly string[]).includes(value)
}

export function isJadeSlotStatus(value: unknown): value is JadeSlotStatus {
  return typeof value === 'string' && (JADE_SLOT_STATUSES as readonly string[]).includes(value)
}

export function isJadeEntitlementEventType(value: unknown): value is JadeEntitlementEventType {
  return typeof value === 'string' && (JADE_ENTITLEMENT_EVENT_TYPES as readonly string[]).includes(value)
}
