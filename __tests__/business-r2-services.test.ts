/**
 * Walz Business (Release 2) — TravelRequestService activation.
 *
 * THE critical cross-tenant test surface: an org-A request must never be
 * linkable to an org-B Quote / Visa case / Itinerary / Trip, even when the
 * caller supplies org B's REAL record id. Also: service ids / request ids
 * from another org collapse to 404; customers can never write a link at all.
 */
const mockTx = {
  travelRequestService: { findFirst: jest.fn(), updateMany: jest.fn() },
  quote: { findUnique: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
  itinerary: { findUnique: jest.fn() },
  trip: { findUnique: jest.fn() },
  organizationMembership: { findFirst: jest.fn(), findMany: jest.fn() },
  businessTraveller: { findFirst: jest.fn(), findMany: jest.fn() },
}
const mockPrisma = {
  $transaction: jest.fn((fn: any) => fn(mockTx)),
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  travelRequest: { findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  businessTraveller: { findUnique: jest.fn() },
  travelRequestTraveller: { create: jest.fn() },
  quote: { findMany: jest.fn() },
  visaApplication: { findMany: jest.fn() },
  itinerary: { findMany: jest.fn() },
  trip: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { getAdminSession } from '@/lib/admin-auth'
import * as permissions from '@/lib/admin/permissions'
import { recordBusinessAudit } from '@/lib/business/audit'
import { POST as linkRoute } from '@/app/api/admin/business/organizations/[id]/requests/[requestId]/services/[serviceId]/link/route'
import { POST as adminCreateService } from '@/app/api/admin/business/organizations/[id]/requests/[requestId]/services/route'
import { GET as candidates } from '@/app/api/admin/business/organizations/[id]/link-candidates/route'
import { POST as customerCreateService } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/route'
import { POST as attachTraveller } from '@/app/api/business/organizations/[id]/requests/[requestId]/travellers/route'
import { ALLOWED_LINKS, LINK_COLUMN } from '@/lib/business/services'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const VIEW = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }
const postReq = (body: unknown) => ({ json: async () => body }) as any
const getReq = (q: Record<string, string>) => ({ nextUrl: { searchParams: new URLSearchParams(q) } }) as any

function service(over: Record<string, unknown> = {}) {
  return {
    id: 'svc_a', travelRequestId: 'req_a', serviceType: 'FLIGHT', createdAt: new Date(),
    linkedQuoteId: null, linkedVisaApplicationId: null, linkedItineraryId: null, linkedTripId: null,
    travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over,
  }
}
const LINK_PARAMS = { params: { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' } }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockTx))
  ;(getAdminSession as jest.Mock).mockResolvedValue(MANAGE)
  // Default: every record exists and its owner (userId u_owner / email
  // owner@a.com) is an ACTIVE member of ORG A — so the pre-existing tests
  // below exercise the unchanged link semantics behind a passing ownership
  // gate. The Finding-A block at the end overrides these per test.
  for (const m of [mockTx.quote, mockTx.visaApplication, mockTx.itinerary, mockTx.trip]) {
    m.findUnique.mockResolvedValue({ id: 'exists', clientEmail: 'owner@a.com', userId: 'u_owner', email: 'owner@a.com' })
  }
  mockTx.organizationMembership.findFirst.mockResolvedValue({ id: 'mem_owner' })
  mockTx.organizationMembership.findMany.mockResolvedValue([{ user: { email: 'owner@a.com' } }])
  mockTx.businessTraveller.findFirst.mockResolvedValue(null)
  mockTx.businessTraveller.findMany.mockResolvedValue([])
  mockTx.travelRequestService.findFirst.mockResolvedValue(null)
  mockTx.travelRequestService.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A })
})

describe('admin link route — access + validation', () => {
  it('rejects unauthenticated (401) and view-only staff (403)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), LINK_PARAMS)).status).toBe(401)
    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW)
    expect((await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), LINK_PARAMS)).status).toBe(403)
    expect(mockTx.travelRequestService.updateMany).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1' }), LINK_PARAMS)
    expect(res.status).toBe(400)
  })

  it('rejects a kind not allowed for the service type (VISA service cannot link a QUOTE)', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ serviceType: 'VISA' }))
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(400)
    expect(ALLOWED_LINKS.VISA).toEqual(['VISA_APPLICATION'])
  })

  it('404s when the target record does not exist', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service())
    mockTx.quote.findUnique.mockResolvedValue(null)
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'nope', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(404)
    expect(mockTx.travelRequestService.updateMany).not.toHaveBeenCalled()
  })
})

describe('admin link route — tenant isolation of the service/request', () => {
  it('Org A URL + a service that hangs off an Org B request -> 404, nothing written', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ travelRequestId: 'req_b', travelRequest: { id: 'req_b', organizationId: ORG_B } }))
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), { params: { id: ORG_A, requestId: 'req_b', serviceId: 'svc_a' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('a service whose request id does not match the URL request -> 404', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ travelRequestId: 'req_other', travelRequest: { id: 'req_other', organizationId: ORG_A } }))
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(404)
  })

  it('a nonexistent service -> 404', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(null)
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q1', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(404)
  })
})

describe.each([
  ['QUOTE', 'FLIGHT', 'quote_of_org_b'],
  ['VISA_APPLICATION', 'VISA', 'visa_of_org_b'],
  ['ITINERARY', 'ITINERARY', 'itinerary_of_org_b'],
  ['TRIP', 'HOTEL', 'trip_of_org_b'],
] as const)('CROSS-ORG LINKAGE ATTACK — %s', (kind, serviceType, orgBRecordId) => {
  it(`an org-A request can never be linked to an org-B ${kind}, even with its real id`, async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ serviceType }))
    // The record genuinely exists…
    // …and is already linked to a service of an ORG B request.
    mockTx.travelRequestService.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where[LINK_COLUMN[kind]] === orgBRecordId && where.travelRequest.organizationId.not === ORG_A ? { id: 'svc_b' } : null))

    const res = await linkRoute(postReq({ action: 'link', kind, targetId: orgBRecordId, reason: 'guessing' }), LINK_PARAMS)
    expect(res.status).toBe(409)
    expect(mockTx.travelRequestService.updateMany).not.toHaveBeenCalled()
    expect(recordBusinessAudit).not.toHaveBeenCalled()
    // The exclusivity probe asked specifically about OTHER organizations.
    expect(mockTx.travelRequestService.findFirst).toHaveBeenCalledWith({
      where: { [LINK_COLUMN[kind]]: orgBRecordId, travelRequest: { organizationId: { not: ORG_A } } },
      select: { id: true },
    })
  })

  it(`links an unowned ${kind} via CAS on the column still being NULL, inside a serializable txn, and audits`, async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ serviceType }))
    const res = await linkRoute(postReq({ action: 'link', kind, targetId: 'fresh_id', reason: 'Booked' }), LINK_PARAMS)
    expect(res.status).toBe(200)
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(mockTx.travelRequestService.updateMany).toHaveBeenCalledWith({
      where: { id: 'svc_a', travelRequestId: 'req_a', [LINK_COLUMN[kind]]: null },
      data: { [LINK_COLUMN[kind]]: 'fresh_id' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'travel_request_service.linked', organizationId: ORG_A, after: { kind, targetId: 'fresh_id', reason: 'Booked' },
    }))
  })
})

describe('admin link route — overwrite + race protection', () => {
  it('never silently overwrites an existing link (CAS count 0 -> 409)', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service())
    mockTx.travelRequestService.updateMany.mockResolvedValue({ count: 0 })
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q2', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(409)
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  })

  it('a serialization failure from a concurrent link returns 409, not 500', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service())
    mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error('could not serialize'), { code: 'P2034' }))
    const res = await linkRoute(postReq({ action: 'link', kind: 'QUOTE', targetId: 'q2', reason: 'r' }), LINK_PARAMS)
    expect(res.status).toBe(409)
  })

  it('unlink requires a reason, CASes on the current value, and audits before/after', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ linkedQuoteId: 'q1' }))
    mockPrisma.travelRequestService.updateMany.mockResolvedValue({ count: 1 })
    const res = await linkRoute(postReq({ action: 'unlink', kind: 'QUOTE', reason: 'Wrong quote' }), LINK_PARAMS)
    expect(res.status).toBe(200)
    expect(mockPrisma.travelRequestService.updateMany).toHaveBeenCalledWith({
      where: { id: 'svc_a', travelRequestId: 'req_a', linkedQuoteId: 'q1' }, data: { linkedQuoteId: null },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'travel_request_service.unlinked', before: { kind: 'QUOTE', targetId: 'q1' },
    }))
  })

  it('unlink of an Org B service via the Org A URL -> 404', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service({ linkedQuoteId: 'q1', travelRequestId: 'req_b', travelRequest: { id: 'req_b', organizationId: ORG_B } }))
    const res = await linkRoute(postReq({ action: 'unlink', kind: 'QUOTE', reason: 'r' }), { params: { id: ORG_A, requestId: 'req_b', serviceId: 'svc_a' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.updateMany).not.toHaveBeenCalled()
  })
})

describe('admin link-candidates search', () => {
  it('denies view-only staff', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW)
    const res = await candidates(getReq({ kind: 'QUOTE', q: 'acme' }), { params: { id: ORG_A } })
    expect(res.status).toBe(403)
  })

  it('404s for an unknown organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    const res = await candidates(getReq({ kind: 'QUOTE', q: 'acme' }), { params: { id: 'org_missing' } })
    expect(res.status).toBe(404)
  })

  it('EXCLUDES records already linked to another organization; flags ones used in this org', async () => {
    mockPrisma.quote.findMany.mockResolvedValue([
      { id: 'q_free', reference: 'Q1', title: 'Free', clientName: 'C', status: 'sent', currency: 'GBP' },
      { id: 'q_org_b', reference: 'Q2', title: 'Owned by B', clientName: 'C', status: 'sent', currency: 'GBP' },
      { id: 'q_org_a', reference: 'Q3', title: 'Used by A', clientName: 'C', status: 'sent', currency: 'GBP' },
    ])
    mockPrisma.travelRequestService.findMany.mockResolvedValue([
      { linkedQuoteId: 'q_org_b', travelRequest: { organizationId: ORG_B } },
      { linkedQuoteId: 'q_org_a', travelRequest: { organizationId: ORG_A } },
    ])
    const res = await candidates(getReq({ kind: 'QUOTE', q: 'acme' }), { params: { id: ORG_A } })
    const body = await res.json()
    expect(body.candidates.map((c: any) => c.id)).toEqual(['q_free', 'q_org_a'])
    expect(body.candidates.find((c: any) => c.id === 'q_org_a').alreadyLinkedInThisOrganization).toBe(true)
  })

  it('visa candidates never select passport/personal fields beyond name', async () => {
    mockPrisma.visaApplication.findMany.mockResolvedValue([])
    await candidates(getReq({ kind: 'VISA_APPLICATION', q: 'smith' }), { params: { id: ORG_A } })
    const select = mockPrisma.visaApplication.findMany.mock.calls[0][0].select
    expect(select.passportNumber).toBeUndefined()
    expect(select.dateOfBirth).toBeUndefined()
  })
})

describe('admin create service', () => {
  it('Org A URL + Org B request id -> 404', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_b', organizationId: ORG_B })
    const res = await adminCreateService(postReq({ serviceType: 'FLIGHT', reason: 'r' }), { params: { id: ORG_A, requestId: 'req_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.create).not.toHaveBeenCalled()
  })

  it('requires b2b.manage and a reason', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW)
    expect((await adminCreateService(postReq({ serviceType: 'FLIGHT', reason: 'r' }), { params: { id: ORG_A, requestId: 'req_a' } })).status).toBe(403)
    ;(getAdminSession as jest.Mock).mockResolvedValue(MANAGE)
    expect((await adminCreateService(postReq({ serviceType: 'FLIGHT' }), { params: { id: ORG_A, requestId: 'req_a' } })).status).toBe(400)
  })
})

describe('customer service creation — can never link', () => {
  function member(role: string, org = ORG_A) {
    return { id: 'mem_1', organizationId: org, userId: 'user_1', role, status: 'ACTIVE' }
  }
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: 'user_1', email: 'u@x.com' } })
    mockPrisma.travelRequestService.create.mockResolvedValue({ id: 'svc_new', serviceType: 'VISA' })
  })

  it('non-member denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await customerCreateService(postReq({ serviceType: 'VISA' }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(404)
  })

  it('TRAVELLER / COORDINATOR denied (minRole TRAVEL_MANAGER)', async () => {
    for (const role of ['TRAVELLER', 'COORDINATOR']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      const res = await customerCreateService(postReq({ serviceType: 'VISA' }), { params: { id: ORG_A, requestId: 'req_a' } })
      expect(res.status).toBe(404)
    }
  })

  it('Org A member targeting Org B URL denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('TRAVEL_MANAGER') : null))
    const res = await customerCreateService(postReq({ serviceType: 'VISA' }), { params: { id: ORG_B, requestId: 'req_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.create).not.toHaveBeenCalled()
  })

  it('Org A TRAVEL_MANAGER + Org B request id via Org A URL -> 404', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_b', organizationId: ORG_B })
    const res = await customerCreateService(postReq({ serviceType: 'VISA' }), { params: { id: ORG_A, requestId: 'req_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.create).not.toHaveBeenCalled()
  })

  it('CROSS-ORG LINKAGE ATTACK via the customer API: supplied linked*Id / targetId are ignored entirely', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_a', organizationId: ORG_A })
    const res = await customerCreateService(postReq({
      serviceType: 'visa', linkedVisaApplicationId: 'visa_of_org_b', linkedQuoteId: 'quote_of_org_b',
      linkedItineraryId: 'itin_of_org_b', linkedTripId: 'trip_of_org_b', targetId: 'x', kind: 'QUOTE',
    }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(201)
    expect(mockPrisma.travelRequestService.create).toHaveBeenCalledWith({ data: { travelRequestId: 'req_a', serviceType: 'VISA' } })
  })
})

describe('customer attach traveller — same-org only', () => {
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: 'user_1', email: 'u@x.com' } })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'mem_1', organizationId: ORG_A, userId: 'user_1', role: 'TRAVEL_MANAGER', status: 'ACTIVE' })
    mockPrisma.travelRequestTraveller.create.mockResolvedValue({ id: 'link_1' })
  })

  it('non-member denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await attachTraveller(postReq({ businessTravellerId: 'bt_a' }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(404)
  })

  it('an Org B traveller can never be attached to an Org A request', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_a', organizationId: ORG_A })
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_b', organizationId: ORG_B })
    const res = await attachTraveller(postReq({ businessTravellerId: 'bt_b' }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestTraveller.create).not.toHaveBeenCalled()
  })

  it('an Org A traveller can never be attached to an Org B request via the Org A URL', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_b', organizationId: ORG_B })
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_a', organizationId: ORG_A })
    const res = await attachTraveller(postReq({ businessTravellerId: 'bt_a' }), { params: { id: ORG_A, requestId: 'req_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestTraveller.create).not.toHaveBeenCalled()
  })

  it('attaches a same-org traveller and audits', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_a', organizationId: ORG_A })
    mockPrisma.businessTraveller.findUnique.mockResolvedValue({ id: 'bt_a', organizationId: ORG_A })
    const res = await attachTraveller(postReq({ businessTravellerId: 'bt_a' }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(201)
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request.traveller_added' }))
  })
})

// ── Security-review remediation — Finding A: service-link OWNERSHIP gate ────

describe('Finding A — link ownership verification + staff override', () => {
  // Simulated directory: which org each identity belongs to.
  const MEMBERS: Record<string, { userId: string; email: string }[]> = {
    [ORG_A]: [{ userId: 'u_a_member', email: 'member@orga.com' }],
    [ORG_B]: [{ userId: 'u_b_member', email: 'member@orgb.com' }],
  }
  const TRAVELLERS: Record<string, { userId: string | null; email: string }[]> = {
    [ORG_A]: [{ userId: 'u_a_trav', email: '  Traveller@OrgA.com ' }],
    [ORG_B]: [{ userId: null, email: 'traveller@orgb.com' }],
  }

  beforeEach(() => {
    mockTx.organizationMembership.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve((MEMBERS[where.organizationId] ?? []).some(m => m.userId === where.userId) ? { id: 'm' } : null))
    mockTx.businessTraveller.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve((TRAVELLERS[where.organizationId] ?? []).some(t => t.userId && t.userId === where.userId) ? { id: 't' } : null))
    mockTx.organizationMembership.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((MEMBERS[where.organizationId] ?? []).map(m => ({ user: { email: m.email } }))))
    mockTx.businessTraveller.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((TRAVELLERS[where.organizationId] ?? []).map(t => ({ email: t.email }))))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(service())
  })

  const link = (body: Record<string, unknown>, svc = service()) => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(svc)
    return linkRoute(postReq({ action: 'link', reason: 'Booked for client', ...body }), LINK_PARAMS)
  }
  const expectNothingWritten = () => {
    expect(mockTx.travelRequestService.updateMany).not.toHaveBeenCalled()
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  }

  // 1
  it.each([
    ['QUOTE by member email (case/whitespace-normalized)', 'QUOTE', 'FLIGHT', { clientEmail: ' MEMBER@orgA.com ' }],
    ['QUOTE by traveller email', 'QUOTE', 'FLIGHT', { clientEmail: 'traveller@orga.com' }],
    ['VISA by member userId', 'VISA_APPLICATION', 'VISA', { userId: 'u_a_member', email: 'unrelated@x.com' }],
    ['VISA by traveller email when userId is null', 'VISA_APPLICATION', 'VISA', { userId: null, email: 'traveller@orga.com' }],
    ['ITINERARY by member email', 'ITINERARY', 'ITINERARY', { clientEmail: 'member@orga.com' }],
    ['TRIP by traveller userId', 'TRIP', 'HOTEL', { userId: 'u_a_trav' }],
  ] as const)('1. correct-org owner links normally, no override needed (%s)', async (_n, kind, serviceType, row) => {
    const model = { QUOTE: mockTx.quote, VISA_APPLICATION: mockTx.visaApplication, ITINERARY: mockTx.itinerary, TRIP: mockTx.trip }[kind]
    model.findUnique.mockResolvedValue({ id: 'rec_1', ...row })
    const res = await link({ kind, targetId: 'rec_1' }, service({ serviceType }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.override).toBeUndefined()
    expect(mockTx.travelRequestService.updateMany).toHaveBeenCalledWith({
      where: { id: 'svc_a', travelRequestId: 'req_a', [LINK_COLUMN[kind]]: null }, data: { [LINK_COLUMN[kind]]: 'rec_1' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request_service.linked' }))
  })

  it('VISA: a userId that does not match is NOT rescued by a matching email (userId is authoritative when present)', async () => {
    mockTx.visaApplication.findUnique.mockResolvedValue({ id: 'v1', userId: 'u_retail', email: 'member@orga.com' })
    const res = await link({ kind: 'VISA_APPLICATION', targetId: 'v1' }, service({ serviceType: 'VISA' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('OWNERSHIP_UNVERIFIED')
    expectNothingWritten()
  })

  // 2
  it.each([
    ['QUOTE owned by an Org B member email', 'QUOTE', 'FLIGHT', { clientEmail: 'member@orgb.com' }],
    ['VISA owned by an Org B member userId', 'VISA_APPLICATION', 'VISA', { userId: 'u_b_member', email: null }],
    ['ITINERARY owned by an Org B traveller email', 'ITINERARY', 'ITINERARY', { clientEmail: 'traveller@orgb.com' }],
    ['TRIP owned by an Org B member userId', 'TRIP', 'HOTEL', { userId: 'u_b_member' }],
  ] as const)('2. another organization\'s legitimate owner is rejected with OWNERSHIP_UNVERIFIED (%s)', async (_n, kind, serviceType, row) => {
    const model = { QUOTE: mockTx.quote, VISA_APPLICATION: mockTx.visaApplication, ITINERARY: mockTx.itinerary, TRIP: mockTx.trip }[kind]
    model.findUnique.mockResolvedValue({ id: 'rec_b', ...row })
    const res = await link({ kind, targetId: 'rec_b' }, service({ serviceType }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('OWNERSHIP_UNVERIFIED')
    expect(body.overrideAvailable).toBe(true)
    // Ownership was checked against the TARGET org (A) only.
    for (const c of mockTx.organizationMembership.findMany.mock.calls.concat(mockTx.organizationMembership.findFirst.mock.calls)) {
      expect(c[0].where.organizationId).toBe(ORG_A)
    }
    expectNothingWritten()
  })

  // 3
  it.each([
    ['QUOTE of a retail customer', 'QUOTE', 'FLIGHT', { clientEmail: 'retail@gmail.com' }],
    ['VISA of a retail user', 'VISA_APPLICATION', 'VISA', { userId: 'u_retail', email: 'retail@gmail.com' }],
    ['VISA with no userId and no email', 'VISA_APPLICATION', 'VISA', { userId: null, email: null }],
    ['TRIP with userId null (anonymous) — never auto-verified', 'TRIP', 'HOTEL', { userId: null }],
  ] as const)('3. unrelated retail / unverifiable owner is rejected (%s)', async (_n, kind, serviceType, row) => {
    const model = { QUOTE: mockTx.quote, VISA_APPLICATION: mockTx.visaApplication, ITINERARY: mockTx.itinerary, TRIP: mockTx.trip }[kind]
    model.findUnique.mockResolvedValue({ id: 'rec_r', ...row })
    const res = await link({ kind, targetId: 'rec_r' }, service({ serviceType }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('OWNERSHIP_UNVERIFIED')
    // Distinguishable from the tenant-isolation 404 and carries NO identity.
    expect(res.status).not.toBe(404)
    expect(JSON.stringify(body)).not.toMatch(/retail|u_retail|@/)
    expectNothingWritten()
  })

  // 4
  it('4. nonexistent resource id keeps the existing generic 404 (no ownership lookups, nothing written)', async () => {
    mockTx.quote.findUnique.mockResolvedValue(null)
    const res = await link({ kind: 'QUOTE', targetId: 'does_not_exist' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Record not found' })
    expect(mockTx.organizationMembership.findFirst).not.toHaveBeenCalled()
    expect(mockTx.organizationMembership.findMany).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  // 5
  it('5. spoofed ownership claims in the request body are ignored — ownership is derived from the record row only', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_retail', clientEmail: 'retail@gmail.com' })
    const res = await link({
      kind: 'QUOTE', targetId: 'q_retail',
      clientEmail: 'member@orga.com', email: 'member@orga.com', userId: 'u_a_member', ownerUserId: 'u_a_member',
      detectedUserId: 'u_a_member', detectedEmail: 'member@orga.com', ownershipVerified: true, override: true, confirmOverride: 'true',
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('OWNERSHIP_UNVERIFIED')
    // The only identity ever compared is the stored row's.
    expect(mockTx.quote.findUnique).toHaveBeenCalledWith({ where: { id: 'q_retail' }, select: { id: true, clientEmail: true } })
    expectNothingWritten()
  })

  it('5b. the customer services API cannot link or trigger an override, even with confirmOverride + spoofed owner fields', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u_a_member', email: 'member@orga.com' } })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'm', organizationId: ORG_A, userId: 'u_a_member', role: 'OWNER', status: 'ACTIVE' })
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_a', organizationId: ORG_A, status: 'DRAFT' })
    mockPrisma.travelRequestService.create.mockResolvedValue({ id: 'svc_new', serviceType: 'FLIGHT', createdAt: new Date() })
    const res = await customerCreateService(postReq({
      serviceType: 'FLIGHT', kind: 'QUOTE', targetId: 'q_retail', linkedQuoteId: 'q_retail',
      confirmOverride: true, overrideReason: 'please', clientEmail: 'member@orga.com',
    }), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(201)
    expect(mockPrisma.travelRequestService.create).toHaveBeenCalledTimes(1)
    for (const c of mockPrisma.travelRequestService.create.mock.calls) {
      expect(JSON.stringify(c[0].data)).not.toMatch(/q_retail|override/i)
    }
    expect(mockTx.travelRequestService.updateMany).not.toHaveBeenCalled()
    expect(recordBusinessAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request_service.link_override' }))
  })

  // 6
  it('6. unauthorized override attempts get exactly the base denial: no admin session 401, customer session 401, view-only staff 403', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_retail', clientEmail: 'retail@gmail.com' })
    const body = { kind: 'QUOTE', targetId: 'q_retail', confirmOverride: true, overrideReason: 'VIP' }

    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    let res = await link(body)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })

    // A logged-in CUSTOMER (next-auth) session is not an admin session.
    getServerSession.mockResolvedValue({ user: { id: 'u_a_member', email: 'member@orga.com' } })
    res = await link(body)
    expect(res.status).toBe(401)

    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW)
    res = await link(body)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('6b. the override re-verifies b2b.manage itself (defense in depth): failing that check returns the base 403 with no side effects', async () => {
    const spy = jest.spyOn(permissions, 'hasPermission')
    spy.mockReturnValueOnce(true).mockReturnValueOnce(false)
    const res = await link({ kind: 'QUOTE', targetId: 'q_retail', confirmOverride: true, overrideReason: 'VIP' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(spy).toHaveBeenLastCalledWith(MANAGE, 'b2b.manage')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
    spy.mockRestore()
  })

  // 7
  it.each([undefined, '', '   ', 42])('7. authorized override without a valid overrideReason (%p) is rejected before any DB work', async overrideReason => {
    const res = await link({ kind: 'QUOTE', targetId: 'q_retail', confirmOverride: true, overrideReason })
    expect(res.status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('7b. override intent must be the strict boolean true — truthy strings are treated as a normal (gated) link', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_retail', clientEmail: 'retail@gmail.com' })
    const res = await link({ kind: 'QUOTE', targetId: 'q_retail', confirmOverride: 'yes', overrideReason: 'VIP' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('OWNERSHIP_UNVERIFIED')
    expectNothingWritten()
  })

  // 8
  it('8. authorized override WITH a reason links and audits action, reasons, detected owner, actor, org + resource ids', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_retail', clientEmail: ' Retail@Gmail.com ' })
    const res = await link({ kind: 'QUOTE', targetId: 'q_retail', confirmOverride: true, overrideReason: 'Corporate card holder booked for colleague' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ service: { id: 'svc_a', linkedQuoteId: 'q_retail' }, override: true })
    expect(mockTx.travelRequestService.updateMany).toHaveBeenCalledWith({
      where: { id: 'svc_a', travelRequestId: 'req_a', linkedQuoteId: null }, data: { linkedQuoteId: 'q_retail' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledTimes(1)
    expect(recordBusinessAudit).toHaveBeenCalledWith({
      organizationId: ORG_A,
      actorStaffId: 's1',
      action: 'travel_request_service.link_override',
      entityType: 'TravelRequestService',
      entityId: 'svc_a',
      before: { kind: 'QUOTE', targetId: null },
      after: {
        kind: 'QUOTE', targetId: 'q_retail', resourceType: 'QUOTE', resourceId: 'q_retail',
        reason: 'Booked for client',
        overrideReason: 'Corporate card holder booked for colleague',
        detectedOwner: { detectedUserId: null, detectedEmail: 'retail@gmail.com' },
      },
    })
  })

  it('8b. VISA override: detected owner goes ONLY to the staff audit row — the response echoes no applicant identity', async () => {
    mockTx.visaApplication.findUnique.mockResolvedValue({ id: 'v_retail', userId: 'u_applicant', email: 'applicant@private.com' })
    const res = await link({ kind: 'VISA_APPLICATION', targetId: 'v_retail', confirmOverride: true, overrideReason: 'Sponsored by employer' }, service({ serviceType: 'VISA' }))
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(text).not.toMatch(/u_applicant|applicant@private\.com|passport/i)
    // Only the ownership fields are read — no passport/personal columns.
    expect(mockTx.visaApplication.findUnique).toHaveBeenCalledWith({ where: { id: 'v_retail' }, select: { id: true, userId: true, email: true } })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'travel_request_service.link_override',
      after: expect.objectContaining({ detectedOwner: { detectedUserId: 'u_applicant', detectedEmail: null } }),
    }))
  })

  it('8c. an override still cannot bypass cross-organization exclusivity (409, nothing written)', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_b', clientEmail: 'member@orgb.com' })
    mockTx.travelRequestService.findFirst.mockResolvedValue({ id: 'svc_b' })
    const res = await link({ kind: 'QUOTE', targetId: 'q_b', confirmOverride: true, overrideReason: 'force it' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).not.toBe('OWNERSHIP_UNVERIFIED')
    expectNothingWritten()
  })

  it('8d. an override used when ownership actually verifies is audited as an ordinary link', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_a', clientEmail: 'member@orga.com' })
    const res = await link({ kind: 'QUOTE', targetId: 'q_a', confirmOverride: true, overrideReason: 'unneeded' })
    expect(res.status).toBe(200)
    expect((await res.json()).override).toBeUndefined()
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'travel_request_service.linked' }))
  })

  // 9
  it('9. duplicate link on an already-linked service keeps the pre-remediation semantics (CAS 0 -> 409, no overwrite, no audit)', async () => {
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_a', clientEmail: 'member@orga.com' })
    mockTx.travelRequestService.updateMany.mockResolvedValue({ count: 0 })
    const res = await link({ kind: 'QUOTE', targetId: 'q_a' }, service({ linkedQuoteId: 'q_a' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already has a linked record/)
    // Same CAS predicate as before: the column must still be NULL.
    expect(mockTx.travelRequestService.updateMany).toHaveBeenCalledWith({
      where: { id: 'svc_a', travelRequestId: 'req_a', linkedQuoteId: null }, data: { linkedQuoteId: 'q_a' },
    })
    expect(recordBusinessAudit).not.toHaveBeenCalled()

    // …and an override cannot turn a duplicate into an overwrite either.
    mockTx.quote.findUnique.mockResolvedValue({ id: 'q_x', clientEmail: 'retail@gmail.com' })
    const res2 = await link({ kind: 'QUOTE', targetId: 'q_x', confirmOverride: true, overrideReason: 'r' }, service({ linkedQuoteId: 'q_a' }))
    expect(res2.status).toBe(409)
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  })
})
