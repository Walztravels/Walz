/**
 * Walz Business (Release 2) — member invite-accept flow.
 * POST /api/business/organizations/[id]/invitation/accept
 *
 * INVITED -> ACTIVE, session-gated, keyed only on (URL org, session user),
 * atomic CAS, audited. An org-A user can never accept an org-B invite (nor
 * anyone else's invite), and every denial is the same generic 404.
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn(), updateMany: jest.fn() },
  organization: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST as accept } from '@/app/api/business/organizations/[id]/invitation/accept/route'
import { assertPendingInvitation } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER_A = 'user_a'
const USER_B = 'user_b'

function invite(over: Record<string, unknown> = {}) {
  return { id: 'mem_inv', organizationId: ORG_A, userId: USER_A, role: 'APPROVER', status: 'INVITED', invitedBy: 'admin@a.com', joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
const req = (body: unknown = {}) => ({ json: async () => body }) as any

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER_A, email: 'a@a.com' } })
  mockPrisma.organization.findUnique.mockResolvedValue({ status: 'ACTIVE' })
  mockPrisma.organizationMembership.updateMany.mockResolvedValue({ count: 1 })
})

describe('assertPendingInvitation', () => {
  it('reads only by the (organizationId, userId) composite key', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite())
    await assertPendingInvitation(USER_A, ORG_A)
    expect(mockPrisma.organizationMembership.findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: ORG_A, userId: USER_A } },
    })
  })

  it('denies ACTIVE / SUSPENDED / REMOVED memberships with the generic 404', async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'REMOVED']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite({ status }))
      expect(await assertPendingInvitation(USER_A, ORG_A)).toEqual({ ok: false, status: 404, error: 'Not found' })
    }
  })

  it('denies missing ids without a DB read', async () => {
    expect((await assertPendingInvitation('', ORG_A)).ok).toBe(false)
    expect((await assertPendingInvitation(USER_A, '')).ok).toBe(false)
    expect(mockPrisma.organizationMembership.findUnique).not.toHaveBeenCalled()
  })
})

describe('POST invitation/accept', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await accept(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(401)
  })

  it('non-member (no invitation at all) gets 404', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await accept(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('accepts: CAS INVITED -> ACTIVE keyed on id + org + session user + INVITED, and audits', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite())
    const res = await accept(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    expect(mockPrisma.organizationMembership.updateMany).toHaveBeenCalledWith({
      where: { id: 'mem_inv', organizationId: ORG_A, userId: USER_A, status: 'INVITED' },
      data: { status: 'ACTIVE', joinedAt: expect.any(Date) },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'member.accept_invite', organizationId: ORG_A, actorUserId: USER_A, entityId: 'mem_inv',
      before: { status: 'INVITED' }, after: { status: 'ACTIVE', role: 'APPROVER' },
    }))
  })

  it('CROSS-ORG: an org-A user cannot accept an org-B invite', async () => {
    // USER_A has an invite in ORG_A only. Targeting ORG_B finds nothing for
    // (ORG_B, USER_A) — the org-B invite belongs to USER_B.
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId, userId } = where.organizationId_userId
      if (organizationId === ORG_A && userId === USER_A) return Promise.resolve(invite())
      if (organizationId === ORG_B && userId === USER_B) return Promise.resolve(invite({ id: 'mem_b', organizationId: ORG_B, userId: USER_B }))
      return Promise.resolve(null)
    })
    const res = await accept(req(), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('a body-supplied membershipId / userId is ignored — cannot accept someone else\'s invite', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.userId === USER_A ? null : invite({ id: 'mem_b', userId: USER_B })))
    const res = await accept(req({ membershipId: 'mem_b', userId: USER_B }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: ORG_A, userId: USER_A } },
    })
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('an already-ACTIVE membership cannot be "re-accepted" (404, no write)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite({ status: 'ACTIVE' }))
    const res = await accept(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('a REMOVED/SUSPENDED membership can never be re-activated through accept', async () => {
    for (const status of ['REMOVED', 'SUSPENDED']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite({ status }))
      const res = await accept(req(), { params: { id: ORG_A } })
      expect(res.status).toBe(404)
    }
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('RACE / double-click: a lost CAS (count 0) returns 404 and writes no audit row', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite())
    mockPrisma.organizationMembership.updateMany.mockResolvedValue({ count: 0 })
    const res = await accept(req(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  })

  it('SUSPENDED or CLOSED organizations cannot be joined', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite())
    for (const status of ['SUSPENDED', 'CLOSED']) {
      mockPrisma.organization.findUnique.mockResolvedValue({ status })
      const res = await accept(req(), { params: { id: ORG_A } })
      expect(res.status).toBe(404)
    }
    expect(mockPrisma.organizationMembership.updateMany).not.toHaveBeenCalled()
  })

  it('every denial has the identical body', async () => {
    const bodies = new Set<string>()
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    bodies.add(JSON.stringify(await (await accept(req(), { params: { id: ORG_A } })).json()))
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite({ status: 'ACTIVE' }))
    bodies.add(JSON.stringify(await (await accept(req(), { params: { id: ORG_A } })).json()))
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(invite())
    mockPrisma.organization.findUnique.mockResolvedValue({ status: 'CLOSED' })
    bodies.add(JSON.stringify(await (await accept(req(), { params: { id: ORG_A } })).json()))
    expect(bodies.size).toBe(1)
  })
})
