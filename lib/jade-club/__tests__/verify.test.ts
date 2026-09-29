/**
 * Jade Travel Club — public QR verification tests.
 * Covers section 11/22/25: valid verification, invalid/forged/stale token
 * rejection, no login/session creation, minimal public data, no Miles/
 * payment/booking leakage.
 */

process.env.JADE_CLUB_QR_SECRET = 'test-secret-for-jade-club-qr-tokens-only'

const membershipFindUnique = jest.fn()
const userFindUnique = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    jadeClubMembership: { findUnique: (...args: unknown[]) => membershipFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}))

import { createMembershipVerificationToken } from '../qr-token'
import { verifyJadeClubToken } from '../verify'

const NOW = new Date('2026-01-01T00:00:00.000Z')

function membershipRow(overrides: Partial<{
  memberCode: string; tier: string; status: string; startedAt: Date; expiresAt: Date | null
  qrTokenVersion: number; userId: string
}> = {}) {
  return {
    memberCode: 'JW-002847',
    tier: 'CLUB_PLUS',
    status: 'ACTIVE',
    startedAt: NOW,
    expiresAt: null,
    qrTokenVersion: 1,
    userId: 'user_1',
    ...overrides,
  }
}

beforeEach(() => {
  membershipFindUnique.mockReset()
  userFindUnique.mockReset()
})

describe('verifyJadeClubToken', () => {
  it('returns a minimal, correct view for a valid token', async () => {
    membershipFindUnique.mockResolvedValue(membershipRow())
    userFindUnique.mockResolvedValue({ name: 'Olawale Somto', email: 'olawale@example.com' })

    const token = createMembershipVerificationToken('membership_1', 1)
    const result = await verifyJadeClubToken(token)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.membership.memberCode).toBe('JW-002847')
    expect(result.membership.tierLabel).toBe('Jade Club+')
    expect(result.membership.statusLabel).toBe('Active')
    expect(result.membership.maskedMemberName).not.toContain('Somto')
    expect(result.membership.maskedMemberName).not.toContain('olawale@example.com')
  })

  it('never leaks userId, email, DB id, Miles, bookings, or payment data', async () => {
    membershipFindUnique.mockResolvedValue(membershipRow())
    userFindUnique.mockResolvedValue({ name: 'Olawale Somto', email: 'olawale@example.com' })

    const token = createMembershipVerificationToken('membership_1', 1)
    const result = await verifyJadeClubToken(token)

    expect(result.ok).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('olawale@example.com')
    expect(serialized).not.toContain('user_1')
    expect(serialized).not.toContain('membership_1')
    expect(serialized.toLowerCase()).not.toContain('miles')
    expect(serialized.toLowerCase()).not.toContain('booking')
    expect(serialized.toLowerCase()).not.toContain('payment')
  })

  it('rejects an invalid/garbled token without ever hitting the database', async () => {
    const result = await verifyJadeClubToken('garbled-not-a-real-token')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid_token')
    expect(membershipFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a forged token (tampered payload with mismatched signature)', async () => {
    const token = createMembershipVerificationToken('membership_1', 1)
    const [, sig] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ membershipId: 'membership_2', ver: 1 })).toString('base64url')
    const result = await verifyJadeClubToken(`${forgedPayload}.${sig}`)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid_token')
    expect(membershipFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a token for a membership that no longer exists', async () => {
    membershipFindUnique.mockResolvedValue(null)
    const token = createMembershipVerificationToken('membership_gone', 1)
    const result = await verifyJadeClubToken(token)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('not_found')
  })

  it('rejects a stale/rotated token (QR replay after rotation)', async () => {
    // Membership has since rotated to version 2 — a token signed for
    // version 1 must be rejected even though its signature is valid.
    membershipFindUnique.mockResolvedValue(membershipRow({ qrTokenVersion: 2 }))
    const staleToken = createMembershipVerificationToken('membership_1', 1)
    const result = await verifyJadeClubToken(staleToken)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('stale_token')
  })

  it('accepts the freshly rotated token', async () => {
    membershipFindUnique.mockResolvedValue(membershipRow({ qrTokenVersion: 2 }))
    userFindUnique.mockResolvedValue({ name: 'Olawale Somto', email: 'olawale@example.com' })
    const freshToken = createMembershipVerificationToken('membership_1', 2)
    const result = await verifyJadeClubToken(freshToken)
    expect(result.ok).toBe(true)
  })

  it('shows "Ongoing" semantics via null validThrough for a membership with no fixed expiry', async () => {
    membershipFindUnique.mockResolvedValue(membershipRow({ expiresAt: null }))
    userFindUnique.mockResolvedValue({ name: 'Jane Doe', email: 'jane@example.com' })
    const token = createMembershipVerificationToken('membership_1', 1)
    const result = await verifyJadeClubToken(token)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.membership.validThrough).toBeNull()
  })

  it('does not create a login/session as a side effect (function has no session/cookie API in its call graph)', async () => {
    membershipFindUnique.mockResolvedValue(membershipRow())
    userFindUnique.mockResolvedValue({ name: 'Jane Doe', email: 'jane@example.com' })
    const token = createMembershipVerificationToken('membership_1', 1)
    await verifyJadeClubToken(token)
    // Structural guarantee: verify.ts imports no auth/session/cookie module.
    const src = require('fs').readFileSync(require.resolve('../verify.ts'), 'utf8')
    expect(src).not.toMatch(/next-auth|cookies\(\)|signIn|createSession/i)
  })
})
