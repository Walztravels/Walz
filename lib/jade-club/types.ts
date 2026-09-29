// lib/jade-club/types.ts — Jade Travel Club Phase 1: shared types.
//
// These union types are the TypeScript-side enforcement layer that mirrors
// the DB CHECK constraints in prisma/migrations/jade_travel_club_v1.sql
// (this repo's convention for status-like fields is TEXT + CHECK, not a
// native Postgres enum — see that migration's header comment for why).
//
// IMPORTANT — do not confuse with Walz Miles: JadeClubTier is a purchased-
// or-granted MEMBERSHIP tier. It is a completely separate concept from
// WalzRewardsMembership.tier (bronze/silver/gold/platinum), which is an
// EARNED loyalty/status tier. Never merge the two.

export const JADE_CLUB_TIERS = ['FREE', 'CLUB', 'CLUB_PLUS'] as const
export type JadeClubTier = (typeof JADE_CLUB_TIERS)[number]

export const JADE_CLUB_STATUSES = ['FREE', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED'] as const
export type JadeClubMembershipStatus = (typeof JADE_CLUB_STATUSES)[number]

export const JADE_CLUB_SOURCES = ['DEFAULT', 'ADMIN_GRANT', 'PROMOTION', 'PURCHASE'] as const
export type JadeClubMembershipSource = (typeof JADE_CLUB_SOURCES)[number]

export const JADE_PHYSICAL_CARD_STATUSES = [
  'NOT_ORDERED', 'REQUESTED', 'APPROVED', 'PRINTING', 'SHIPPED', 'DELIVERED', 'CANCELLED',
] as const
export type JadePhysicalCardStatus = (typeof JADE_PHYSICAL_CARD_STATUSES)[number]

export const JADE_BENEFIT_CATEGORIES = ['WALZ', 'PARTNER'] as const
export type JadeBenefitCategory = (typeof JADE_BENEFIT_CATEGORIES)[number]

export const JADE_BENEFIT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMING_SOON'] as const
export type JadeBenefitStatus = (typeof JADE_BENEFIT_STATUSES)[number]

export const JADE_BENEFIT_ACTIVATION_METHODS = ['EXTERNAL_LINK', 'CODE', 'API', 'MANUAL', 'NONE'] as const
export type JadeBenefitActivationMethod = (typeof JADE_BENEFIT_ACTIVATION_METHODS)[number]

export function isJadeClubTier(value: unknown): value is JadeClubTier {
  return typeof value === 'string' && (JADE_CLUB_TIERS as readonly string[]).includes(value)
}

export function isJadeClubMembershipStatus(value: unknown): value is JadeClubMembershipStatus {
  return typeof value === 'string' && (JADE_CLUB_STATUSES as readonly string[]).includes(value)
}

export function isJadeClubMembershipSource(value: unknown): value is JadeClubMembershipSource {
  return typeof value === 'string' && (JADE_CLUB_SOURCES as readonly string[]).includes(value)
}

export function isJadePhysicalCardStatus(value: unknown): value is JadePhysicalCardStatus {
  return typeof value === 'string' && (JADE_PHYSICAL_CARD_STATUSES as readonly string[]).includes(value)
}

// Tier display labels — never invent pricing here.
export const JADE_CLUB_TIER_LABELS: Record<JadeClubTier, string> = {
  FREE:      'Jade Free',
  CLUB:      'Jade Club',
  CLUB_PLUS: 'Jade Club+',
}

export const JADE_CLUB_STATUS_LABELS: Record<JadeClubMembershipStatus, string> = {
  FREE:      'Free',
  ACTIVE:    'Active',
  EXPIRING:  'Expiring Soon',
  EXPIRED:   'Expired',
  CANCELLED: 'Cancelled',
}
