/**
 * Walz Business (Release 2.2) Slice B — Item C: auto-flip
 * ONBOARDING -> ACTIVE on the first successful bootstrap invitation
 * acceptance (lib/business/invitations.ts::acceptOrganizationInvitation).
 *
 * SECURITY FIX (post-review, MEDIUM finding): the gate for this
 * auto-activation is "the ORGANIZATION genuinely had zero existing
 * OrganizationMembership rows (any status) immediately before this
 * acceptance created the first one" — NOT merely "this particular user has
 * no membership row yet" (!existingBefore is necessary but not sufficient:
 * an ACTIVE multi-member org that staff manually reverts to ONBOARDING,
 * then invites a brand-new user via the bootstrap route, would previously
 * have incorrectly re-activated). The membership-count condition is folded
 * into the SAME atomic SQL statement as the status CAS via prisma.$executeRaw
 * (a single UPDATE ... WHERE status = 'ONBOARDING' AND a correlated
 * COUNT(*) over organization_memberships = 1) rather than expressed as a
 * separate, racy read-then-write — so it fires at most once, exactly like
 * the plain-column CAS it replaces.
 */
const mockPrisma = {
  organizationInvitation: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const mockAudit = jest.fn()
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: (...args: unknown[]) => mockAudit(...args) }))

import { acceptOrganizationInvitation, hashInvitationToken } from '@/lib/business/invitations'

const ORG_A = 'org_a'
const USER = 'user_1'
const TOKEN = 'd'.repeat(64)
const TOKEN_HASH = hashInvitationToken(TOKEN)
const NOW = new Date()
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000)

function invitation(over: Record<string, unknown> = {}) {
  return {
    id: 'inv_1', organizationId: ORG_A, email: 'jane@acme.com', role: 'OWNER',
    tokenHash: TOKEN_HASH, invitedByStaffId: 'staff_1', invitedByMembershipId: null,
    expiresAt: FUTURE, consumedAt: null, consumedByUserId: null, createdAt: NOW,
    ...over,
  }
}

// Helper: inspect the raw-SQL UPDATE's text + bound values the way the
// implementation calls prisma.$executeRaw(Prisma.sql`...`) — a Prisma.Sql
// tagged-template object exposing `.sql` (text with `?` placeholders) and
// `.values` (the bound parameters, in order).
function rawCallArg() {
  return mockPrisma.$executeRaw.mock.calls[0][0] as { sql: string; values: unknown[] }
}

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
  mockAudit.mockResolvedValue({ id: 'audit_1' })
  mockPrisma.user.findUnique.mockResolvedValue({ id: USER, email: 'jane@acme.com' })
  mockPrisma.organizationInvitation.updateMany.mockResolvedValue({ count: 1 })
  // BOOTSTRAP default: no pre-existing membership for this (org, user).
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
  mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_new', role: 'OWNER' })
})

describe('acceptOrganizationInvitation — Item C: ONBOARDING -> ACTIVE auto-activation', () => {
  it('fires on the first (bootstrap) acceptance when the org is ONBOARDING: one atomic raw UPDATE keyed on status AND membership-count = 1, then audits', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.$executeRaw.mockResolvedValue(1)

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)
    const raw = rawCallArg()
    expect(raw.sql).toMatch(/UPDATE organizations/i)
    expect(raw.sql).toMatch(/status = 'ONBOARDING'/)
    expect(raw.sql).toMatch(/organization_memberships/)
    expect(raw.sql).toMatch(/=\s*1\s*$/)
    expect(raw.values).toEqual([ORG_A, ORG_A])
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_A,
      actorUserId: USER,
      action: 'organization.status_changed',
      entityType: 'Organization',
      entityId: ORG_A,
      before: { status: 'ONBOARDING' },
      after: { status: 'ACTIVE', reason: 'First organization member accepted their invitation' },
    }))
  })

  it('does NOT fire when the organization is not ONBOARDING at that instant (raw UPDATE affects 0 rows) — skips silently, no status-change audit, acceptance still succeeds', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.$executeRaw.mockResolvedValue(0)

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status_changed' }))
  })

  it('REGRESSION (MEDIUM finding): a brand-new user with no membership anywhere accepting a bootstrap invite into an org that ALREADY has other members and was manually reverted to ONBOARDING does NOT re-activate the organization', async () => {
    // Org A: multiple existing members, staff manually reverted ACTIVE -> ONBOARDING
    // via the status endpoint. Staff now uses the bootstrap route to invite a
    // brand-new user who has never had a membership row anywhere.
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null) // this user: no row yet
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_newcomer', role: 'OWNER' })
    // The raw atomic UPDATE's own WHERE clause (status = 'ONBOARDING' AND
    // membership-count = 1) is what the real DB would evaluate — since the
    // org genuinely has other membership rows, that correlated COUNT(*) is
    // > 1, so the UPDATE affects 0 rows, exactly as a real Postgres instance
    // would resolve it.
    mockPrisma.$executeRaw.mockResolvedValue(0)

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_newcomer' })
    // The gate was still attempted (it's unconditional on the bootstrap
    // branch) — the DB-side WHERE clause is what correctly rejects it.
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)
    const raw = rawCallArg()
    expect(raw.sql).toMatch(/organization_memberships/)
    expect(raw.values).toEqual([ORG_A, ORG_A])
    // No auto-activation audit — the org's deliberate ONBOARDING status
    // (set by staff) must not be silently overridden.
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status_changed' }))
  })

  it('PRESERVED POSITIVE CASE: brand-new org, ONBOARDING, zero members — first bootstrap invitation accepted — membership becomes OWNER AND the organization transitions ONBOARDING -> ACTIVE, audited correctly', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation({ role: 'OWNER' }))
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_owner_1', role: 'OWNER' })
    // Real DB: org has zero membership rows before this one, so the
    // correlated COUNT(*) = 1 once this membership exists -> the atomic
    // UPDATE's WHERE clause matches and affects exactly 1 row.
    mockPrisma.$executeRaw.mockResolvedValue(1)

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_owner_1', role: 'OWNER' })
    expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: ORG_A, userId: USER, role: 'OWNER', status: 'ACTIVE' }),
    }))
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'organization.status_changed',
      organizationId: ORG_A,
      before: { status: 'ONBOARDING' },
      after: { status: 'ACTIVE', reason: 'First organization member accepted their invitation' },
    }))
  })

  it('CONCURRENCY/CAS: two near-simultaneous first-acceptances for the same organization fire the status transition at most once (no double-activation, no duplicate audit row)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_new', role: 'OWNER' })
    // Simulate the real atomic-UPDATE semantics under a race: whichever
    // caller's statement reaches Postgres first wins (affects 1 row and
    // flips status away from ONBOARDING); every subsequent call — whether a
    // genuine second acceptance or a replay — affects 0 rows because the
    // WHERE clause's status = 'ONBOARDING' condition no longer holds (or,
    // equivalently, the membership-count condition no longer reads as 1).
    mockPrisma.$executeRaw
      .mockResolvedValueOnce(1) // first caller wins the CAS
      .mockResolvedValueOnce(0) // second (near-simultaneous) caller loses it

    const [first, second] = await Promise.all([
      acceptOrganizationInvitation(TOKEN, USER, NOW),
      acceptOrganizationInvitation(TOKEN, USER, NOW),
    ])

    // Both acceptance calls still resolve (membership creation itself is
    // independently CAS-guarded by the invitation's own one-time
    // consumption — this test only exercises the auto-activation gate).
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2)

    const statusChangeAuditCalls = mockAudit.mock.calls.filter(
      (call) => (call[0] as { action?: string })?.action === 'organization.status_changed',
    )
    expect(statusChangeAuditCalls).toHaveLength(1)
    expect(statusChangeAuditCalls[0][0]).toMatchObject({
      after: { status: 'ACTIVE', reason: 'First organization member accepted their invitation' },
    })
  })

  it('does NOT fire on a SECOND member accepting (subsequent-member / pre-existing INVITED membership path)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'INVITED',
    })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'OWNER', status: 'ACTIVE' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_existing' })
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status_changed' }))
  })

  it('does NOT fire on a REMOVED-member reactivation (not the bootstrap branch)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'REMOVED',
    })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'OWNER', status: 'ACTIVE' })

    await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('NON-FATAL: a throw from the raw auto-activation UPDATE never turns a successful bootstrap acceptance into a failure', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.$executeRaw.mockRejectedValue(new Error('db down'))

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new', role: 'OWNER' })
  })

  it('NON-FATAL: a throw from recordBusinessAudit on the status-change call never turns a successful bootstrap acceptance into a failure', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.$executeRaw.mockResolvedValue(1)
    mockAudit
      .mockResolvedValueOnce({ id: 'audit_invitation_accepted' }) // invitation.accepted succeeds
      .mockRejectedValueOnce(new Error('audit db down')) // organization.status_changed throws

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
  })
})
