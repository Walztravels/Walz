/**
 * Jade Travel Club — type-guard tests. These guards are the TypeScript-side
 * enforcement mirroring the DB CHECK constraints (see the migration's header
 * comment) — they are what stands between a corrupt/legacy DB value and an
 * invalid membership tier/status being trusted by the app.
 */

import {
  isJadeClubTier, isJadeClubMembershipStatus, isJadeClubMembershipSource, isJadePhysicalCardStatus,
} from '../types'

describe('isJadeClubTier', () => {
  it('accepts valid tiers', () => {
    expect(isJadeClubTier('FREE')).toBe(true)
    expect(isJadeClubTier('CLUB')).toBe(true)
    expect(isJadeClubTier('CLUB_PLUS')).toBe(true)
  })
  it('rejects invalid/foreign values — including the Walz Miles loyalty tier vocabulary', () => {
    expect(isJadeClubTier('bronze')).toBe(false)
    expect(isJadeClubTier('gold')).toBe(false)
    expect(isJadeClubTier('platinum')).toBe(false)
    expect(isJadeClubTier('')).toBe(false)
    expect(isJadeClubTier(null)).toBe(false)
    expect(isJadeClubTier(undefined)).toBe(false)
    expect(isJadeClubTier(123)).toBe(false)
  })
})

describe('isJadeClubMembershipStatus', () => {
  it('accepts valid statuses', () => {
    for (const s of ['FREE', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED']) {
      expect(isJadeClubMembershipStatus(s)).toBe(true)
    }
  })
  it('rejects invalid values', () => {
    expect(isJadeClubMembershipStatus('PAID')).toBe(false)
    expect(isJadeClubMembershipStatus('active')).toBe(false) // case-sensitive
  })
})

describe('isJadeClubMembershipSource', () => {
  it('accepts valid sources', () => {
    for (const s of ['DEFAULT', 'ADMIN_GRANT', 'PROMOTION', 'PURCHASE']) {
      expect(isJadeClubMembershipSource(s)).toBe(true)
    }
  })
  it('rejects invalid values', () => {
    expect(isJadeClubMembershipSource('CUSTOMER_SELF_SERVICE')).toBe(false)
  })
})

describe('isJadePhysicalCardStatus', () => {
  it('accepts every lifecycle stage from the brief', () => {
    for (const s of ['NOT_ORDERED', 'REQUESTED', 'APPROVED', 'PRINTING', 'SHIPPED', 'DELIVERED', 'CANCELLED']) {
      expect(isJadePhysicalCardStatus(s)).toBe(true)
    }
  })
  it('rejects invalid values', () => {
    expect(isJadePhysicalCardStatus('IN_TRANSIT')).toBe(false)
  })
})
