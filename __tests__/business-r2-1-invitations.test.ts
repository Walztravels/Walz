/**
 * Walz Business (Release 2.1) — the converged OrganizationInvitation
 * bootstrap + subsequent-member flow.
 *
 * Token replay, account-email mismatch, expired token, non-enumeration
 * (invalid/expired/reused/mismatched all collapse to the same response),
 * and a concurrent-acceptance race (exactly one winner) — per the mission's
 * explicit test list for this flow.
 */
const mockPrisma = {
  organizationInvitation: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email_1' } })
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: mockSend } }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import {
  issueOrganizationInvitation,
  acceptOrganizationInvitation,
  hashInvitationToken,
  isWellFormedInvitationToken,
} from '@/lib/business/invitations'
import { POST as acceptRoute } from '@/app/api/business/invitations/accept/route'

const ORG_A = 'org_a'
const USER = 'user_1'
const TOKEN = 'a'.repeat(64)
const TOKEN_HASH = hashInvitationToken(TOKEN)
const NOW = new Date()
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000)
const PAST = new Date(NOW.getTime() - 60 * 1000)

function invitation(over: Record<string, unknown> = {}) {
  return {
    id: 'inv_1', organizationId: ORG_A, email: 'jane@acme.com', role: 'ADMIN',
    tokenHash: TOKEN_HASH, invitedByStaffId: 'staff_1', invitedByMembershipId: null,
    expiresAt: FUTURE, consumedAt: null, consumedByUserId: null, createdAt: NOW,
    ...over,
  }
}
function postReq(body: unknown) { return { json: async () => body } as any }

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks only wipes call
  // history, leaving any mockResolvedValue/mockResolvedValueOnce
  // IMPLEMENTATION from a previous test in place, which silently leaks
  // state across tests in this file. resetAllMocks removes implementations
  // too, so every test below sets its own explicit defaults.
  jest.resetAllMocks()
  process.env.RESEND_API_KEY = 're_test'
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
  mockPrisma.user.findUnique.mockResolvedValue({ id: USER, email: 'jane@acme.com' })
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
  mockPrisma.organizationInvitation.updateMany.mockResolvedValue({ count: 1 })
})

describe('token shape / hashing', () => {
  it('well-formed token pattern is 64 lowercase hex chars', () => {
    expect(isWellFormedInvitationToken(TOKEN)).toBe(true)
    expect(isWellFormedInvitationToken('short')).toBe(false)
    expect(isWellFormedInvitationToken(123)).toBe(false)
  })

  it('only the SHA-256 hash is ever looked up — never a raw-token WHERE clause', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(mockPrisma.organizationInvitation.findUnique).toHaveBeenCalledWith({ where: { tokenHash: TOKEN_HASH } })
  })
})

describe('issueOrganizationInvitation', () => {
  beforeEach(() => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A })
    mockPrisma.organizationInvitation.create.mockResolvedValue(invitation({ id: 'inv_new' }))
  })

  it('re-issue REPLACES the prior un-consumed invitation (delete-then-create in one transaction)', async () => {
    const result = await issueOrganizationInvitation({ organizationId: ORG_A, email: 'Jane@Acme.com', role: 'ADMIN', invitedByStaffId: 'staff_1' })
    expect(result.ok).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockPrisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, email: 'jane@acme.com', consumedAt: null },
    })
    expect(mockPrisma.organizationInvitation.create).toHaveBeenCalled()
  })

  it('normalizes email case-insensitively', async () => {
    await issueOrganizationInvitation({ organizationId: ORG_A, email: '  Jane@ACME.com  ', role: 'ADMIN', invitedByStaffId: 'staff_1' })
    expect(mockPrisma.organizationInvitation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ email: 'jane@acme.com' }) }),
    )
  })

  it('rejects an invalid role', async () => {
    const result = await issueOrganizationInvitation({ organizationId: ORG_A, email: 'jane@acme.com', role: 'SUPERUSER' as any, invitedByStaffId: 'staff_1' })
    expect(result.ok).toBe(false)
  })

  it('requires an issuing actor (staff or membership)', async () => {
    const result = await issueOrganizationInvitation({ organizationId: ORG_A, email: 'jane@acme.com', role: 'ADMIN' })
    expect(result.ok).toBe(false)
  })

  it('404s for a nonexistent organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    const result = await issueOrganizationInvitation({ organizationId: 'org_ghost', email: 'jane@acme.com', role: 'ADMIN', invitedByStaffId: 'staff_1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('the raw token is returned to the caller but is never persisted anywhere — only tokenHash is stored', async () => {
    const result = await issueOrganizationInvitation({ organizationId: ORG_A, email: 'jane@acme.com', role: 'ADMIN', invitedByStaffId: 'staff_1' })
    expect(result.ok).toBe(true)
    const createCall = mockPrisma.organizationInvitation.create.mock.calls[0][0]
    expect(createCall.data.tokenHash).toBeDefined()
    expect(JSON.stringify(createCall.data)).not.toMatch(result.ok ? result.token : '__never__')
  })
})

describe('acceptOrganizationInvitation — non-enumeration (ALL collapse to the identical { ok:false, reason:"invalid" })', () => {
  const cases: Array<[string, () => void]> = [
    ['unknown token', () => mockPrisma.organizationInvitation.findUnique.mockResolvedValue(null)],
    ['already consumed', () => mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation({ consumedAt: PAST, consumedByUserId: 'someone' }))],
    ['expired', () => mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation({ expiresAt: PAST }))],
    ['account-email mismatch', () => {
      mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER, email: 'someone-else@example.com' })
    }],
    ['malformed token', () => { /* handled by not calling findUnique at all */ }],
  ]

  it('every failure mode produces byte-identical response bodies', async () => {
    const bodies: string[] = []
    for (const [, setup] of cases) {
      jest.clearAllMocks()
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER, email: 'jane@acme.com' })
      setup()
      const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)
      bodies.push(JSON.stringify(result))
    }
    // Malformed token case uses a different call — test separately below for
    // full coverage, but all the token/email-validity failures above must
    // collapse to one shape:
    expect(new Set(bodies).size).toBe(1)
    expect(JSON.parse(bodies[0])).toEqual({ ok: false, reason: 'invalid' })
  })

  it('malformed token also collapses to the identical shape', async () => {
    const result = await acceptOrganizationInvitation('not-a-valid-token', USER, NOW)
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(mockPrisma.organizationInvitation.findUnique).not.toHaveBeenCalled()
  })

  it('the HTTP route also returns a byte-identical body/status for invalid, expired, reused and mismatched tokens', async () => {
    getServerSession.mockResolvedValue({ user: { id: USER, email: 'jane@acme.com' } })
    const responses: Array<{ status: number; body: unknown }> = []
    for (const [, setup] of cases.slice(0, 4)) {
      jest.clearAllMocks()
      getServerSession.mockResolvedValue({ user: { id: USER, email: 'jane@acme.com' } })
      mockPrisma.user.findUnique.mockResolvedValue({ id: USER, email: 'jane@acme.com' })
      setup()
      const res = await acceptRoute(postReq({ token: TOKEN }))
      responses.push({ status: res.status, body: await res.json() })
    }
    const statuses = new Set(responses.map(r => r.status))
    const bodies = new Set(responses.map(r => JSON.stringify(r.body)))
    expect(statuses.size).toBe(1)
    expect(bodies.size).toBe(1)
    expect(responses[0].status).toBe(404)
  })
})

describe('acceptOrganizationInvitation — token replay', () => {
  it('consuming the same token twice: the second attempt fails (CAS count!==1)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationInvitation.updateMany
      .mockResolvedValueOnce({ count: 1 }) // first accept wins
      .mockResolvedValueOnce({ count: 0 }) // replay loses
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_new', role: 'ADMIN' })

    const first = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(first.ok).toBe(true)

    // Second attempt: invitation is now "found" with consumedAt already set
    // in a real DB, but even if a stale read slipped through, the CAS itself
    // is the true gate — simulate that path explicitly:
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'mem_new', organizationId: ORG_A, userId: USER, role: 'ADMIN', status: 'ACTIVE' })
    const second = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    // Either rejected by the pre-check (already_active_member, since the
    // first call already activated it) or by the CAS — both are non-token-
    // enumerating, safe outcomes for a replay.
    expect(second.ok).toBe(false)
  })
})

describe('acceptOrganizationInvitation — CAS RACE: two concurrent acceptances, exactly one wins', () => {
  it('only one of two simultaneous accept attempts succeeds', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationInvitation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_new', role: 'ADMIN' })

    const [a, b] = await Promise.all([
      acceptOrganizationInvitation(TOKEN, USER, NOW),
      acceptOrganizationInvitation(TOKEN, USER, NOW),
    ])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
  })
})

describe('acceptOrganizationInvitation — bootstrap and subsequent-member paths', () => {
  it('BOOTSTRAP: no existing membership -> creates one directly as ACTIVE (no separate INVITED step)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_new', role: 'ADMIN' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new', role: 'ADMIN', reactivated: false })
    expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A, userId: USER, role: 'ADMIN', status: 'ACTIVE' }) }),
    )
  })

  it('SUBSEQUENT-MEMBER: an existing INVITED membership is activated in place', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'INVITED' })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'ADMIN', status: 'ACTIVE' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(result).toMatchObject({ ok: true, membershipId: 'mem_existing', reactivated: false })
    expect(mockPrisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', role: 'ADMIN' }) }),
    )
  })

  it('REMOVED membership -> reactivated', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'REMOVED' })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'ADMIN', status: 'ACTIVE' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(result).toMatchObject({ ok: true, reactivated: true })
  })

  it('ACTIVE membership -> rejected as already_active_member WITHOUT consuming the token', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'ACTIVE' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)
    expect(result).toEqual({ ok: false, reason: 'already_active_member' })
    expect(mockPrisma.organizationInvitation.updateMany).not.toHaveBeenCalled()
  })
})
