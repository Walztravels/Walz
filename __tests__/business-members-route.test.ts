/**
 * Walz Business (Release 1) — /api/business/organizations/[id]/members
 * GET (list, minRole COORDINATOR — SECURITY FIX, delta review: the floor
 * role TRAVELLER must not see the full roster) / POST (invite, minRole
 * ADMIN).
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/portal/notifications', () => ({ createCustomerNotification: jest.fn().mockResolvedValue(undefined) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET, POST } from '@/app/api/business/organizations/[id]/members/route'
import { recordBusinessAudit } from '@/lib/business/audit'
import { createCustomerNotification } from '@/lib/portal/notifications'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function getReq() {
  return {} as unknown as Parameters<typeof GET>[0]
}
function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

function membershipRow(overrides: Partial<{ organizationId: string; role: string; status: string }> = {}) {
  return {
    id: 'mem_1', organizationId: ORG_A, userId: USER, role: 'TRAVELLER', status: 'ACTIVE',
    invitedBy: null, joinedAt: new Date(), lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
})

describe('GET members', () => {
  it('denies a non-member with 404', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })

  // SECURITY FIX (delta review): the floor role TRAVELLER must not see the
  // full organization member roster by default.
  it('denies the floor role TRAVELLER with the same generic 404, without querying the member list', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.findMany).not.toHaveBeenCalled()
  })

  it('allows COORDINATOR (the lowest role that keeps roster visibility)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR' }))
    mockPrisma.organizationMembership.findMany.mockResolvedValue([
      { id: 'mem_1', userId: USER, role: 'COORDINATOR', status: 'ACTIVE', joinedAt: null, user: { name: 'A', email: 'a@x.com' } },
    ])
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toHaveLength(1)
  })

  it('allows the management tier (TRAVEL_MANAGER/APPROVER/FINANCE) and ADMIN/OWNER to see the full roster', async () => {
    for (const role of ['TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'ADMIN', 'OWNER']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role }))
      mockPrisma.organizationMembership.findMany.mockResolvedValue([{ id: 'mem_1' }])
      const res = await GET(getReq(), { params: { id: ORG_A } })
      expect(res.status).toBe(200)
    }
  })
})

describe('POST invite member', () => {
  it('denies insufficient role (TRAVELLER cannot invite — requires ADMIN)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await POST(postReq({ email: 'new@x.com', role: 'TRAVELLER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.create).not.toHaveBeenCalled()
  })

  it('denies a cross-organization invite attempt (ADMIN of Org A targeting Org B)', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow({ role: 'ADMIN' }) : null)
    })
    const res = await POST(postReq({ email: 'new@x.com', role: 'TRAVELLER' }), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.create).not.toHaveBeenCalled()
  })

  it('rejects an invite for an email with no Walz account', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await POST(postReq({ email: 'nobody@x.com', role: 'TRAVELLER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembership.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid role', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    const res = await POST(postReq({ email: 'new@x.com', role: 'SUPERUSER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('allows ADMIN to invite an existing user and records an audit row', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'new@x.com' })
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_2', userId: 'user_2', role: 'TRAVELLER', status: 'INVITED' })

    const res = await POST(postReq({ email: 'new@x.com', role: 'TRAVELLER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
    expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: ORG_A, userId: 'user_2', role: 'TRAVELLER', status: 'INVITED' }),
    }))
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.invite' }))
  })

  it('allows OWNER (above ADMIN) to invite', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'OWNER' }))
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'new@x.com' })
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_2', userId: 'user_2', role: 'FINANCE', status: 'INVITED' })
    const res = await POST(postReq({ email: 'new@x.com', role: 'FINANCE' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
  })

  it('returns 409 when the invitee is already a member', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'new@x.com' })
    mockPrisma.organizationMembership.create.mockRejectedValue(new Error('unique constraint'))
    const res = await POST(postReq({ email: 'new@x.com', role: 'TRAVELLER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(409)
  })
})

// ── Release 2 additions ─────────────────────────────────────────────────────

describe('GET members — explicit cross-organization framing (R2)', () => {
  it('an ACTIVE ADMIN of Org A targeting Org B\'s member list gets the generic 404 and no roster query runs', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow({ role: 'ADMIN' }) : null)
    })
    const res = await GET(getReq(), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(mockPrisma.organizationMembership.findMany).not.toHaveBeenCalled()
  })

  it('when allowed, the roster query is scoped to the URL organization only', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.organizationMembership.findMany.mockResolvedValue([])
    await GET(getReq(), { params: { id: ORG_A } })
    expect(mockPrisma.organizationMembership.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG_A })
  })
})

describe('POST invite — customer portal notification (R2)', () => {
  it('notifies the invitee via lib/portal/notifications with a relative /business link', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'new@x.com' })
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_2', userId: 'user_2', role: 'APPROVER', status: 'INVITED' })
    const res = await POST(postReq({ email: 'new@x.com', role: 'APPROVER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
    expect(createCustomerNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_2', category: 'ACCOUNT', type: 'b2b_member_invited', href: '/business',
      entityType: 'OrganizationMembership', entityId: 'mem_2', dedupeKey: 'b2b-member-invite:mem_2',
    }))
  })

  it('a notification failure never fails the committed invite', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'ADMIN' }))
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'new@x.com' })
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'mem_2', userId: 'user_2', role: 'APPROVER', status: 'INVITED' })
    ;(createCustomerNotification as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const res = await POST(postReq({ email: 'new@x.com', role: 'APPROVER' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
  })

  it('no notification is sent when the invite is denied cross-org', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? membershipRow({ role: 'ADMIN' }) : null))
    await POST(postReq({ email: 'new@x.com', role: 'TRAVELLER' }), { params: { id: ORG_B } })
    expect(createCustomerNotification).not.toHaveBeenCalled()
  })
})
