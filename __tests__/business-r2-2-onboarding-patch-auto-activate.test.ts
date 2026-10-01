/**
 * Walz Business (Release 2.2) Slice B — Item C: auto-flip
 * ONBOARDING -> ACTIVE on the first successful bootstrap invitation
 * acceptance (lib/business/invitations.ts::acceptOrganizationInvitation).
 *
 * CAS-guarded exactly like the organization-type/currency reclassification
 * routes (organization.updateMany keyed on status:'ONBOARDING'), NOT the
 * plain update() the status route uses. Fires only on the BOOTSTRAP branch
 * (no pre-existing membership), only when the org is still exactly
 * ONBOARDING at that instant, and is audited via recordBusinessAudit.
 */
const mockPrisma = {
  organizationInvitation: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  organization: { findUnique: jest.fn(), updateMany: jest.fn() },
  organizationMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
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
  it('fires on the first (bootstrap) acceptance when the org is ONBOARDING: CAS updateMany keyed on status, then audits', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: ORG_A, status: 'ONBOARDING' },
      data: { status: 'ACTIVE' },
    })
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

  it('does NOT fire when the organization is not ONBOARDING at that instant (CAS count 0) — skips silently, no status-change audit, acceptance still succeeds', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: ORG_A, status: 'ONBOARDING' },
      data: { status: 'ACTIVE' },
    })
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status_changed' }))
  })

  it('does NOT fire on a SECOND member accepting (subsequent-member / pre-existing INVITED membership path)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'INVITED',
    })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'OWNER', status: 'ACTIVE' })

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_existing' })
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status_changed' }))
  })

  it('does NOT fire on a REMOVED-member reactivation (not the bootstrap branch)', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'mem_existing', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'REMOVED',
    })
    mockPrisma.organizationMembership.update.mockResolvedValue({ id: 'mem_existing', role: 'OWNER', status: 'ACTIVE' })

    await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('NON-FATAL: a throw from organization.updateMany never turns a successful bootstrap acceptance into a failure', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organization.updateMany.mockRejectedValue(new Error('db down'))

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new', role: 'OWNER' })
  })

  it('NON-FATAL: a throw from recordBusinessAudit on the status-change call never turns a successful bootstrap acceptance into a failure', async () => {
    mockPrisma.organizationInvitation.findUnique.mockResolvedValue(invitation())
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
    mockAudit
      .mockResolvedValueOnce({ id: 'audit_invitation_accepted' }) // invitation.accepted succeeds
      .mockRejectedValueOnce(new Error('audit db down')) // organization.status_changed throws

    const result = await acceptOrganizationInvitation(TOKEN, USER, NOW)

    expect(result).toMatchObject({ ok: true, membershipId: 'mem_new' })
  })
})
