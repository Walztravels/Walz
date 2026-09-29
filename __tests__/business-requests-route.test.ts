/**
 * Walz Business (Release 1) — /api/business/organizations/[id]/requests
 * GET (list, no minRole to CALL it, but SECURITY FIX per delta review: the
 * floor role TRAVELLER's results are filtered to only requests they
 * themselves submitted or that name them as a traveller — never the full
 * org list) / POST (create DRAFT, minRole TRAVEL_MANAGER).
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  travelRequest: { findMany: jest.fn(), create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET, POST } from '@/app/api/business/organizations/[id]/requests/route'
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

describe('GET travel requests', () => {
  it('denies a non-member', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })

  it('COORDINATOR and above see the full org-wide list (unfiltered where)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR' }))
    mockPrisma.travelRequest.findMany.mockResolvedValue([
      { id: 'r1', title: 'Lagos trip', notes: null, status: 'DRAFT', submittedByMembershipId: 'mem_1', createdAt: new Date() },
    ])
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requests).toHaveLength(1)
    expect(mockPrisma.travelRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG_A },
    }))
  })

  // SECURITY FIX (delta review): the floor role TRAVELLER must only see
  // their own business travel requests — either ones they submitted, or
  // ones that name them as a traveller.
  it('TRAVELLER gets a filtered where-clause scoped to their own submitted or traveller-linked requests only', async () => {
    const mem = membershipRow({ role: 'TRAVELLER' })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(mem)
    mockPrisma.travelRequest.findMany.mockResolvedValue([])
    const res = await GET(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    expect(mockPrisma.travelRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORG_A,
        OR: [
          { submittedByMembershipId: mem.id },
          { travellers: { some: { businessTraveller: { userId: USER } } } },
        ],
      },
    }))
  })

  it('TRAVELLER never receives the unfiltered org-wide where-clause', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    mockPrisma.travelRequest.findMany.mockResolvedValue([])
    await GET(getReq(), { params: { id: ORG_A } })
    const calledWhere = mockPrisma.travelRequest.findMany.mock.calls[0][0].where
    expect(calledWhere).not.toEqual({ organizationId: ORG_A })
  })
})

describe('POST create travel request', () => {
  it('denies insufficient role (TRAVELLER cannot create — requires TRAVEL_MANAGER)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await POST(postReq({ title: 'Trip' }), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.create).not.toHaveBeenCalled()
  })

  it('denies a cross-organization attempt', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow({ role: 'TRAVEL_MANAGER' }) : null)
    })
    const res = await POST(postReq({ title: 'Trip' }), { params: { id: ORG_B } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.create).not.toHaveBeenCalled()
  })

  it('creates a DRAFT request stamped with the caller\'s own membership id, and audits it', async () => {
    const mem = membershipRow({ role: 'TRAVEL_MANAGER' })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(mem)
    mockPrisma.travelRequest.create.mockResolvedValue({ id: 'r1', title: 'Trip', notes: null, status: 'DRAFT' })

    const res = await POST(postReq({ title: 'Trip', notes: 'Lagos' }), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
    expect(mockPrisma.travelRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORG_A,
        submittedByMembershipId: mem.id,
        status: 'DRAFT',
      }),
    }))
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request.create' }))
  })

  it('allows title/notes to be omitted', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'APPROVER' }))
    mockPrisma.travelRequest.create.mockResolvedValue({ id: 'r2', title: null, notes: null, status: 'DRAFT' })
    const res = await POST(postReq({}), { params: { id: ORG_A } })
    expect(res.status).toBe(201)
  })
})
