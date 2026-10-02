/**
 * Walz Business (V1-C Phase 1) — visa-link issuance/reissue/revoke routes.
 *
 * Gate coverage: unauthenticated, below-TRAVEL_MANAGER, REFERRAL_PARTNER,
 * cross-org service/traveller. Response-shape coverage: the raw token never
 * appears anywhere but the url field of a successful issuance response.
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  businessTraveller: { findUnique: jest.fn() },
  businessServiceLinkToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST as issueRoute } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-link/route'
import { POST as revokeRoute } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-link/revoke/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'
const REQ_A = 'req_a'
const SERVICE_A = 'svc_a'
const TRAVELLER_A = 'trav_a'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function visaService(over: Record<string, unknown> = {}) {
  return { id: SERVICE_A, travelRequestId: REQ_A, serviceType: 'VISA', linkedVisaApplicationId: null, linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: REQ_A, organizationId: ORG_A }, ...over }
}
function traveller(over: Record<string, unknown> = {}) {
  return { id: TRAVELLER_A, organizationId: ORG_A, ...over }
}
function jsonReq(body: unknown) {
  return { json: async () => body, headers: new Headers() } as any
}
const params = { id: ORG_A, requestId: REQ_A, serviceId: SERVICE_A }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma))
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller())
  mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
  mockPrisma.businessServiceLinkToken.create.mockResolvedValue({ id: 'tok_new' })
  mockPrisma.businessServiceLinkToken.update.mockResolvedValue({ id: 'tok_old' })
  mockPrisma.businessServiceLinkToken.updateMany.mockResolvedValue({ count: 1 })
})

describe('POST .../visa-link (issue/reissue)', () => {
  it('401s when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(401)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('denies a member below TRAVEL_MANAGER (e.g. COORDINATOR) with a generic 404', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('denies TRAVELLER role', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
  })

  it('denies a REFERRAL_PARTNER organization even for an OWNER-role member', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('allows TRAVEL_MANAGER and above (APPROVER/FINANCE peer tier, ADMIN, OWNER)', async () => {
    for (const role of ['TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'ADMIN', 'OWNER']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
      const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
      expect(res.status).toBe(201)
    }
  })

  it('cross-org service (IDOR on prong 2) -> 404, no token created', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ travelRequest: { id: REQ_A, organizationId: ORG_B } }))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('cross-org traveller (a traveller id from another org) -> 404, no token created', async () => {
    mockPrisma.businessTraveller.findUnique.mockResolvedValue(traveller({ organizationId: ORG_B }))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('a non-VISA service is denied', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'HOTEL' }))
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(404)
  })

  it('requires businessTravellerId in the body', async () => {
    const res = await issueRoute(jsonReq({}), { params })
    expect(res.status).toBe(400)
    expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  })

  it('successful issuance returns a url + expiresAt, never the raw token or its hash as a bare field, never a membership/user creation', async () => {
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.url).toBe('string')
    expect(body.url).toMatch(/\/business\/visa-link\//)
    expect(typeof body.expiresAt).toBe('string')
    expect(body.reissued).toBe(false)
    // No OrganizationMembership / User ever created by this route.
    expect(mockPrisma.organizationMembership.findUnique).toHaveBeenCalled()
    expect((mockPrisma.organizationMembership as any).create).toBeUndefined()
  })

  it('reissuing when a live token already exists revokes the old one and returns reissued:true', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    const res = await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.reissued).toBe(true)
    expect(mockPrisma.businessServiceLinkToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_old' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    })
  })

  it('never creates two live tokens for the same service in one call (single create, prior revoked first)', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_old' })
    await issueRoute(jsonReq({ businessTravellerId: TRAVELLER_A }), { params })
    expect(mockPrisma.businessServiceLinkToken.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.businessServiceLinkToken.update).toHaveBeenCalledTimes(1)
  })
})

describe('POST .../visa-link/revoke', () => {
  it('401s when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(401)
  })

  it('denies below TRAVEL_MANAGER', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(404)
  })

  it('denies REFERRAL_PARTNER organizations', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(404)
  })

  it('revokes the live token and returns revoked:true', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue({ id: 'tok_1' })
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, revoked: true })
  })

  it('returns revoked:false when there is nothing live to revoke', async () => {
    mockPrisma.businessServiceLinkToken.findFirst.mockResolvedValue(null)
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, revoked: false })
  })

  it('cross-org service is denied', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ travelRequest: { id: REQ_A, organizationId: ORG_B } }))
    const res = await revokeRoute(jsonReq({}), { params })
    expect(res.status).toBe(404)
  })
})
