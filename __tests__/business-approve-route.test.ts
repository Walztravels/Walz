/**
 * Walz Business (Release 1) —
 * POST /api/business/organizations/[id]/requests/[requestId]/approve
 *
 * minRole APPROVER, cross-org denial, and — the critical case — the atomic
 * compare-and-swap concurrency guard: two simultaneous decisions on the same
 * TravelApproval row must only let one through.
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  travelRequest: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  travelApproval: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST } from '@/app/api/business/organizations/[id]/requests/[requestId]/approve/route'
import { recordBusinessAudit } from '@/lib/business/audit'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const REQUEST_ID = 'req_1'
const USER = 'user_1'

function postReq(body: Record<string, unknown> = {}) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

function membershipRow(overrides: Partial<{ organizationId: string; role: string; status: string; id: string }> = {}) {
  return {
    id: 'mem_1', organizationId: ORG_A, userId: USER, role: 'APPROVER', status: 'ACTIVE',
    invitedBy: null, joinedAt: new Date(), lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  mockPrisma.travelRequest.update.mockResolvedValue({})
})

describe('POST approve — access control', () => {
  it('denies insufficient role (TRAVELLER cannot decide — requires APPROVER)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'TRAVELLER' }))
    const res = await POST(postReq(), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelApproval.updateMany).not.toHaveBeenCalled()
  })

  it('denies COORDINATOR', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow({ role: 'COORDINATOR' }))
    const res = await POST(postReq(), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(404)
  })

  it('denies a cross-organization attempt: ACTIVE APPROVER of Org A targeting Org B\'s request', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) => {
      const { organizationId } = where.organizationId_userId
      return Promise.resolve(organizationId === ORG_A ? membershipRow() : null)
    })
    const res = await POST(postReq(), { params: { id: ORG_B, requestId: REQUEST_ID } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.findUnique).not.toHaveBeenCalled()
  })

  it('denies when the TravelRequest belongs to a different organization than the URL claims', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow())
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: REQUEST_ID, organizationId: ORG_B, status: 'SUBMITTED' })
    const res = await POST(postReq(), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelApproval.updateMany).not.toHaveBeenCalled()
  })

  it('denies when the TravelRequest does not exist at all', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow())
    mockPrisma.travelRequest.findUnique.mockResolvedValue(null)
    const res = await POST(postReq(), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(404)
  })
})

describe('POST approve — happy path', () => {
  beforeEach(() => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow())
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: REQUEST_ID, organizationId: ORG_A, status: 'SUBMITTED' })
  })

  it('creates the PENDING approval row on first decision, then CAS-updates it to APPROVED', async () => {
    mockPrisma.travelApproval.findUnique.mockResolvedValueOnce(null)
    mockPrisma.travelApproval.create.mockResolvedValue({ id: 'appr_1', decision: 'PENDING' })
    mockPrisma.travelApproval.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(postReq({ decision: 'APPROVED' }), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.travelApproval.updateMany).toHaveBeenCalledWith({
      where: { id: 'appr_1', decision: 'PENDING' },
      data: expect.objectContaining({ decision: 'APPROVED' }),
    })
    expect(mockPrisma.travelRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'APPROVED' },
    }))
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request.approve' }))
  })

  it('supports REJECTED decisions too', async () => {
    mockPrisma.travelApproval.findUnique.mockResolvedValueOnce({ id: 'appr_1', decision: 'PENDING' })
    mockPrisma.travelApproval.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(postReq({ decision: 'REJECTED', reason: 'Budget' }), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.travelApproval.updateMany).toHaveBeenCalledWith({
      where: { id: 'appr_1', decision: 'PENDING' },
      data: expect.objectContaining({ decision: 'REJECTED', reason: 'Budget' }),
    })
  })

  it('rejects immediately (no CAS call) when the approval row already has a decision', async () => {
    mockPrisma.travelApproval.findUnique.mockResolvedValueOnce({ id: 'appr_1', decision: 'APPROVED' })
    const res = await POST(postReq({ decision: 'APPROVED' }), { params: { id: ORG_A, requestId: REQUEST_ID } })
    expect(res.status).toBe(409)
    expect(mockPrisma.travelApproval.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST approve — concurrent-decision race (CAS)', () => {
  it('only the first of two simultaneous decisions wins; the second gets 409', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(membershipRow())
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: REQUEST_ID, organizationId: ORG_A, status: 'SUBMITTED' })

    // Both concurrent calls read the SAME pending approval row (the race
    // window this test is about) before either has written anything.
    mockPrisma.travelApproval.findUnique
      .mockResolvedValueOnce({ id: 'appr_1', decision: 'PENDING' })
      .mockResolvedValueOnce({ id: 'appr_1', decision: 'PENDING' })

    // The DB itself only lets ONE compare-and-swap succeed: the first
    // updateMany() call matches decision:'PENDING' and wins (count: 1); the
    // second's WHERE no longer matches because the row was already flipped
    // by the winner, so its count is 0 — exactly what a real Postgres
    // UPDATE ... WHERE decision = 'PENDING' would do under a race.
    mockPrisma.travelApproval.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    // The loser's post-CAS re-read sees the winner's committed decision.
    mockPrisma.travelApproval.findUnique.mockResolvedValueOnce({ id: 'appr_1', decision: 'APPROVED' })

    const [firstRes, secondRes] = await Promise.all([
      POST(postReq({ decision: 'APPROVED' }), { params: { id: ORG_A, requestId: REQUEST_ID } }),
      POST(postReq({ decision: 'REJECTED' }), { params: { id: ORG_A, requestId: REQUEST_ID } }),
    ])

    const statuses = [firstRes.status, secondRes.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(mockPrisma.travelApproval.updateMany).toHaveBeenCalledTimes(2)

    const loserBody = await (firstRes.status === 409 ? firstRes : secondRes).json()
    expect(loserBody.error).toBe('This approval has already been decided')
    expect(loserBody.decision).toBe('APPROVED')
  })
})
