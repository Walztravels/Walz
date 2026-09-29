/**
 * Jade Travel Club — membership core tests.
 * Covers section 25 MEMBERSHIP scenarios: existing client defaults safely to
 * Jade Free, no duplicate customer identity, paid tiers cannot be activated
 * through client manipulation, membership status logic, and the admin-only
 * audited mutation path.
 */

process.env.JADE_CLUB_QR_SECRET = 'test-secret-for-jade-club-qr-tokens-only'

const membershipFindUnique = jest.fn()
const membershipCreate     = jest.fn()
const membershipUpdate     = jest.fn()
const activityLogCreate    = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    jadeClubMembership: {
      findUnique: (...args: unknown[]) => membershipFindUnique(...args),
      create:     (...args: unknown[]) => membershipCreate(...args),
      update:     (...args: unknown[]) => membershipUpdate(...args),
    },
    activityLog: { create: (...args: unknown[]) => activityLogCreate(...args) },
  },
}))

import {
  ensureJadeClubMembership, getJadeClubMembership, adminAdjustMembership, rotateOwnVerificationToken,
} from '../membership'
import type { AdminSession } from '@/lib/admin-auth'

const NOW = new Date('2026-01-01T00:00:00.000Z')

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jcm_1',
    userId: 'user_1',
    memberCode: 'JW-002847',
    tier: 'FREE',
    status: 'FREE',
    source: 'DEFAULT',
    startedAt: NOW,
    expiresAt: null,
    cancelledAt: null,
    qrTokenVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function fakeAdmin(role: string): AdminSession {
  return {
    id: 'staff_1', email: 'staff@walztravels.com', name: 'Staff Member', roleTitle: 'Agent',
    sendingEmail: 'reservations@walztravels.com', signatureTagline: null,
    role, staffRole: role, permissions: {}, branch: 'HQ', department: 'Ops', isActive: true,
  }
}

beforeEach(() => {
  membershipFindUnique.mockReset()
  membershipCreate.mockReset()
  membershipUpdate.mockReset()
  activityLogCreate.mockReset()
  activityLogCreate.mockResolvedValue({})
})

describe('ensureJadeClubMembership — Jade Free default, no duplicate identity', () => {
  it('creates a FREE/FREE/DEFAULT row lazily on first access', async () => {
    membershipFindUnique.mockResolvedValueOnce(null)
    membershipCreate.mockResolvedValueOnce(fakeRow())

    const result = await ensureJadeClubMembership('user_1')

    expect(result.tier).toBe('FREE')
    expect(result.status).toBe('FREE')
    expect(result.source).toBe('DEFAULT')
    expect(membershipCreate).toHaveBeenCalledTimes(1)
    const createArgs = membershipCreate.mock.calls[0][0]
    expect(createArgs.data.userId).toBe('user_1')
    expect(createArgs.data.tier).toBe('FREE')
    expect(createArgs.data.status).toBe('FREE')
    expect(createArgs.data.source).toBe('DEFAULT')
  })

  it('does not create a second row for a user who already has one (idempotent — no duplicate identity)', async () => {
    membershipFindUnique.mockResolvedValueOnce(fakeRow())

    const result = await ensureJadeClubMembership('user_1')

    expect(result.userId).toBe('user_1')
    expect(membershipCreate).not.toHaveBeenCalled()
  })

  it('the public memberCode is never the internal DB id', async () => {
    membershipFindUnique.mockResolvedValueOnce(fakeRow())
    const result = await ensureJadeClubMembership('user_1')
    expect(result.memberCode).not.toBe(result.id)
    expect(result.memberCode).toMatch(/^JW-\d{6}$/)
  })
})

describe('getJadeClubMembership — read-only, never creates a row', () => {
  it('returns null for a user with no membership row (a valid Jade Free state)', async () => {
    membershipFindUnique.mockResolvedValueOnce(null)
    const result = await getJadeClubMembership('user_never_visited')
    expect(result).toBeNull()
    expect(membershipCreate).not.toHaveBeenCalled()
  })
})

describe('adminAdjustMembership — server-authoritative, audited, RBAC-gated', () => {
  it('rejects a role without jade_club.manage WITHOUT touching the database (no unauthorized tier upgrade)', async () => {
    const unauthorized = fakeAdmin('sales_rep')
    await expect(
      adminAdjustMembership(unauthorized, 'user_1', { tier: 'CLUB_PLUS', reason: 'self-upgrade attempt' }),
    ).rejects.toThrow(/FORBIDDEN/)
    expect(membershipFindUnique).not.toHaveBeenCalled()
    expect(membershipUpdate).not.toHaveBeenCalled()
    expect(activityLogCreate).not.toHaveBeenCalled()
  })

  it('rejects a missing/blank reason even for an authorized admin', async () => {
    const admin = fakeAdmin('super_admin')
    await expect(
      adminAdjustMembership(admin, 'user_1', { tier: 'CLUB', reason: '   ' }),
    ).rejects.toThrow(/reason/i)
    expect(membershipUpdate).not.toHaveBeenCalled()
  })

  it('allows an authorized admin to adjust tier/status and writes a before/after audit row', async () => {
    const admin = fakeAdmin('super_admin')
    membershipFindUnique.mockResolvedValueOnce(fakeRow()) // ensureJadeClubMembership's lookup
    membershipUpdate.mockResolvedValueOnce(fakeRow({ tier: 'CLUB_PLUS', status: 'ACTIVE', source: 'ADMIN_GRANT' }))

    const result = await adminAdjustMembership(admin, 'user_1', {
      tier: 'CLUB_PLUS', status: 'ACTIVE', reason: 'Manual VIP grant approved by ops',
    })

    expect(result.tier).toBe('CLUB_PLUS')
    expect(result.source).toBe('ADMIN_GRANT')

    const updateArgs = membershipUpdate.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ userId: 'user_1' })
    expect(updateArgs.data.source).toBe('ADMIN_GRANT') // PURCHASE is never set by app code

    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    const logArgs = activityLogCreate.mock.calls[0][0].data
    expect(logArgs.module).toBe('jade_club')
    expect(logArgs.action).toBe('JADE_CLUB_MEMBERSHIP_ADJUSTED')
    expect(logArgs.staffId).toBe('staff_1')
    expect(logArgs.before).toEqual({ tier: 'FREE', status: 'FREE', expiresAt: null, source: 'DEFAULT' })
    expect(logArgs.after).toEqual({ tier: 'CLUB_PLUS', status: 'ACTIVE', expiresAt: null, source: 'ADMIN_GRANT' })
  })

  it('never lets the app set source to PURCHASE (no paid activation exists in Phase 1)', async () => {
    const admin = fakeAdmin('super_admin')
    membershipFindUnique.mockResolvedValueOnce(fakeRow())
    membershipUpdate.mockResolvedValueOnce(fakeRow({ tier: 'CLUB', source: 'ADMIN_GRANT' }))

    await adminAdjustMembership(admin, 'user_1', { tier: 'CLUB', reason: 'Promo grant' })

    const updateArgs = membershipUpdate.mock.calls[0][0]
    expect(updateArgs.data.source).not.toBe('PURCHASE')
  })
})

describe('rotateOwnVerificationToken — customer-scoped, cannot touch another customer', () => {
  it('scopes the update to the caller\'s own userId only', async () => {
    membershipFindUnique.mockResolvedValueOnce(fakeRow())
    membershipUpdate.mockResolvedValueOnce(fakeRow({ qrTokenVersion: 2 }))

    await rotateOwnVerificationToken('user_1')

    const updateArgs = membershipUpdate.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ userId: 'user_1' })
    expect(updateArgs.data).toEqual({ qrTokenVersion: { increment: 1 } })
  })
})
