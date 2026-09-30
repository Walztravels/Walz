/**
 * Walz Business (Release 2) — customer travel-request detail + approval UX.
 *
 * GET /api/business/organizations/[id]/requests/[requestId] (and the
 * services sub-list) enforce both prongs; TRAVELLER keeps the R1 scope
 * (own/named requests only, no financials, no other travellers' emails).
 * The Approve/Reject UI handles the CAS route's 409 gracefully, and the
 * approve route's CAS race still yields exactly one winner.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  travelRequest: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  travelApproval: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  businessAuditLog: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  quote: { findMany: jest.fn() },
  visaApplication: { findMany: jest.fn() },
  itinerary: { findMany: jest.fn() },
  trip: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import fs from 'fs'
import path from 'path'
import { GET as getDetail } from '@/app/api/business/organizations/[id]/requests/[requestId]/route'
import { GET as getServices } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/route'
import { POST as approve } from '@/app/api/business/organizations/[id]/requests/[requestId]/approve/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_me', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: 'req_a', organizationId: ORG_A, submittedByMembershipId: 'mem_other', status: 'AWAITING_APPROVAL', title: 'Lagos offsite', notes: 'n',
    createdAt: new Date(), updatedAt: new Date(),
    submittedBy: { id: 'mem_other', role: 'TRAVEL_MANAGER', user: { name: 'Tia', email: 't@a.com' } },
    travellers: [
      { createdAt: new Date(), businessTraveller: { id: 'bt_1', firstName: 'Ada', lastName: 'O', email: 'ada@a.com', userId: 'user_ada', organizationId: ORG_A } },
      // Defence in depth: a join row pointing at another org's traveller is never rendered.
      { createdAt: new Date(), businessTraveller: { id: 'bt_x', firstName: 'Evil', lastName: 'B', email: 'x@b.com', userId: null, organizationId: ORG_B } },
    ],
    services: [
      { id: 'svc_1', travelRequestId: 'req_a', serviceType: 'FLIGHT', createdAt: new Date(), linkedQuoteId: 'q1', linkedVisaApplicationId: null, linkedItineraryId: null, linkedTripId: null },
    ],
    approvals: [],
    ...over,
  }
}
const ctx = (id = ORG_A, requestId = 'req_a') => ({ params: { id, requestId } })

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'me@a.com' } })
  mockPrisma.businessAuditLog.findMany.mockResolvedValue([])
  mockPrisma.user.findMany.mockResolvedValue([])
  mockPrisma.quote.findMany.mockResolvedValue([{ id: 'q1', reference: 'Q-1', title: 'Flights', status: 'sent', currency: 'NGN', totalMinor: BigInt(123456), validUntil: new Date('2026-10-10') }])
  mockPrisma.travelRequest.update.mockResolvedValue({})
  // R2.1: lib/business/org-type-gate.ts consults organization.organizationType.
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
})

describe.each([
  ['detail', getDetail],
  ['services', getServices],
] as const)('GET request %s — tenant isolation', (_n, handler) => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await handler({} as any, ctx())).status).toBe(401)
  })

  it('non-member denied (404)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    expect((await handler({} as any, ctx())).status).toBe(404)
    expect(mockPrisma.travelRequest.findUnique).not.toHaveBeenCalled()
  })

  it('Org A member targeting Org B URL denied (404)', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('ADMIN') : null))
    expect((await handler({} as any, ctx(ORG_B, 'req_b'))).status).toBe(404)
    expect(mockPrisma.travelRequest.findUnique).not.toHaveBeenCalled()
  })

  it('Org A member + Org B request id via the Org A URL -> 404 (prong 2)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow({ id: 'req_b', organizationId: ORG_B }))
    expect((await handler({} as any, ctx(ORG_A, 'req_b'))).status).toBe(404)
    expect(mockPrisma.quote.findMany).not.toHaveBeenCalled()
  })
})

describe('GET request detail — role scoping', () => {
  it('management tier sees financials, traveller emails, services and never another org\'s traveller', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('APPROVER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow())
    const res = await getDetail({} as any, ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travellers.map((t: any) => t.id)).toEqual(['bt_1'])
    expect(body.travellers[0].email).toBe('ada@a.com')
    expect(body.services[0].links[0]).toEqual(expect.objectContaining({ kind: 'QUOTE', reference: 'Q-1', currency: 'NGN', total: '1234.56' }))
  })

  it('TRAVELLER who neither submitted nor is named -> 404 (R1 scope preserved)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow())
    expect((await getDetail({} as any, ctx())).status).toBe(404)
  })

  it('TRAVELLER named on the request sees it — but no financials and no other travellers\' emails', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user_ada', email: 'ada@a.com' } })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER', { userId: 'user_ada' }))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow())
    const res = await getDetail({} as any, ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travellers[0].email).toBeNull()
    expect(body.services[0].links[0].total).toBeUndefined()
    expect(body.services[0].links[0].currency).toBeUndefined()
  })

  it('TRAVELLER who submitted the request sees it', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow({ submittedByMembershipId: 'mem_me' }))
    expect((await getDetail({} as any, ctx())).status).toBe(200)
  })

  it('timeline is read from the verified org only and hides staff identities from customers', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow())
    mockPrisma.businessAuditLog.findMany.mockResolvedValue([
      { id: 'a1', action: 'travel_request_service.linked', createdAt: new Date(), actorUserId: null, actorStaffId: 'ops@walztravels.com' },
    ])
    const body = await (await getDetail({} as any, ctx())).json()
    expect(mockPrisma.businessAuditLog.findMany.mock.calls[0][0].where.organizationId).toBe(ORG_A)
    expect(body.timeline[0].actor).toBe('Walz Travels')
    expect(JSON.stringify(body)).not.toContain('ops@walztravels.com')
  })

  it('Finding A: a staff ownership override appears to the organization as an ordinary link, with no detected owner data', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue(requestRow())
    mockPrisma.businessAuditLog.findMany.mockResolvedValue([
      {
        id: 'a2', action: 'travel_request_service.link_override', createdAt: new Date(), actorUserId: null, actorStaffId: 's1',
        after: { overrideReason: 'x', detectedOwner: { detectedUserId: 'u_applicant', detectedEmail: 'applicant@private.com' } },
      },
    ])
    const body = await (await getDetail({} as any, ctx())).json()
    expect(body.timeline[0].action).toBe('travel_request_service.linked')
    expect(JSON.stringify(body)).not.toMatch(/override|u_applicant|applicant@private\.com/)
  })
})

describe('approval CAS race (reusing the R1 pattern) — the loser gets 409', () => {
  it('two approvers deciding concurrently on the same row: exactly one 200, one 409 carrying the winning decision', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('APPROVER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_a', organizationId: ORG_A, status: 'AWAITING_APPROVAL' })
    mockPrisma.travelApproval.findUnique
      .mockResolvedValueOnce(null) // first caller: no row yet
      .mockResolvedValueOnce(null) // second caller: no row yet
      .mockResolvedValueOnce({ id: 'appr_1', decision: 'PENDING' }) // loser re-reads after create conflict
      .mockResolvedValueOnce({ id: 'appr_1', decision: 'REJECTED' }) // loser post-CAS re-read
    mockPrisma.travelApproval.create
      .mockResolvedValueOnce({ id: 'appr_1', decision: 'PENDING' })
      .mockRejectedValueOnce(new Error('Unique constraint failed'))
    mockPrisma.travelApproval.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const body = (decision: string) => ({ json: async () => ({ decision, reason: 'x' }) }) as any
    const [r1, r2] = await Promise.all([approve(body('REJECTED'), ctx()), approve(body('APPROVED'), ctx())])
    expect([r1.status, r2.status].sort()).toEqual([200, 409])
    const loser = await (r1.status === 409 ? r1 : r2).json()
    expect(loser.decision).toBe('REJECTED')
  })

  it('the Approve/Reject UI treats 409 as an "already decided" state, not a raw error', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'business', '[orgId]', 'requests', '[requestId]', 'ApprovalPanel.tsx'), 'utf8')
    expect(src).toMatch(/res\.status === 409/)
    expect(src).toMatch(/already been decided/)
    expect(src).toMatch(/\/approve`/)
    // Reject requires a reason in the UI.
    expect(src).toMatch(/decision === 'REJECTED' && !reason\.trim\(\)/)
  })
})
