/**
 * Walz Business (Release 1) — /api/business/organizations/[id]/travellers
 * GET (list, minRole COORDINATOR) / POST (create, minRole TRAVEL_MANAGER).
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  businessTraveller: { findMany: jest.fn(), create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET, POST } from '@/app/api/business/organizations/[id]/travellers/route'
import { recordBusinessAudit } from '@/lib/business/audit'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function getReq() { return {} as unknown as Parameters<typeof GET>[0] }
function postReq(body: Record<string, unknown>) { return { json: async () => body } as unknown as Parameters<typeof POST>[0] }

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

describe('GET travellers', () => {
  it('denies a non-member', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })

  it('denies the floor TRAVELLER role with the generic 404 (minRole COORDINATOR) and runs no roster query', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('allows a COORDINATOR: 200 with the full list, never leaking a raw userId', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR' }))
    mockPrisma.businessTraveller.findMany.mockResolvedValue([
      { id: 't1', firstName: 'A', lastName: 'B', email: 'a@x.com', phone: null, status: 'active', userId: 'user_99', createdAt: new Date() },
      { id: 't2', firstName: 'C', lastName: 'D', email: 'c@x.com', phone: '1', status: 'active', userId: null, createdAt: new Date() },
    ])
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travellers).toHaveLength(2)
    expect(body.travellers[0].linked).toBe(true)
    expect(body.travellers[1].linked).toBe(false)
    expect(body.travellers[0].userId).toBeUndefined()
  })

  it.each(['TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'ADMIN', 'OWNER'])('roles above COORDINATOR retain access (%s -> 200)', async role => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role }))
    mockPrisma.businessTraveller.findMany.mockResolvedValue([])
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
  })
})

describe('POST create traveller', () => {
  it('denies insufficient role (TRAVELLER cannot create — requires TRAVEL_MANAGER)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await POST(postReq({ firstName: 'A', lastName: 'B', email: 'a@x.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.create).not.toHaveBeenCalled()
  })

  it('denies COORDINATOR (below the TRAVEL_MANAGER peer tier)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR' }))
    const res = await POST(postReq({ firstName: 'A', lastName: 'B', email: 'a@x.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })

  it('denies a cross-organization attempt (TRAVEL_MANAGER of Org A targeting Org B)', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow({ role: 'TRAVEL_MANAGER' }) : null)
    })
    const res = await POST(postReq({ firstName: 'A', lastName: 'B', email: 'a@x.com' }), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.create).not.toHaveBeenCalled()
  })

  it('rejects a missing required field', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVEL_MANAGER' }))
    const res = await POST(postReq({ firstName: 'A', email: 'a@x.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('allows TRAVEL_MANAGER to create a traveller, never setting userId, and audits it', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVEL_MANAGER' }))
    mockPrisma.businessTraveller.create.mockResolvedValue({ id: 't1', firstName: 'A', lastName: 'B', email: 'a@x.com', phone: null, status: 'active' })

    const res = await POST(postReq({ firstName: 'A', lastName: 'B', email: 'A@X.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
    const createArgs = mockPrisma.businessTraveller.create.mock.calls[0][0]
    expect(createArgs.data.userId).toBeUndefined()
    expect(createArgs.data.email).toBe('a@x.com')
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'traveller.create' }))
  })

  it('allows the peer-tier APPROVER role too (documented tie with TRAVEL_MANAGER)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'APPROVER' }))
    mockPrisma.businessTraveller.create.mockResolvedValue({ id: 't2', firstName: 'C', lastName: 'D', email: 'c@x.com', phone: null, status: 'active' })
    const res = await POST(postReq({ firstName: 'C', lastName: 'D', email: 'c@x.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
  })
})

// ── Release 2 additions ─────────────────────────────────────────────────────

describe('GET travellers — explicit cross-organization framing (R2)', () => {
  it('an ACTIVE member of Org A targeting Org B\'s traveller list gets the generic 404 and no traveller query runs', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow({ role: 'OWNER' }) : null)
    })
    const res = await GET(getReq(), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('when allowed, the traveller query is scoped to the URL organization only', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVEL_MANAGER' }))
    mockPrisma.businessTraveller.findMany.mockResolvedValue([])
    await GET(getReq(), { params: { id: ORG_A } })
    expect(mockPrisma.businessTraveller.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG_A })
  })
})
