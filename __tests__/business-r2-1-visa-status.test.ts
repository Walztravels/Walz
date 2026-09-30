/**
 * Walz Business (Release 2.1 remediation) — the SEPARATE, narrow,
 * business-friendly visa-status projection (built instead of widening the
 * sensitive visa-documents metadata route).
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  travelRequestTraveller: { findFirst: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
  visaCaseDocument: { count: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET as visaStatusGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-status/route'
import { toBusinessFriendlyStatus, computeActionNeeded } from '@/lib/business/visa-status'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'
const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function visaService(over: Record<string, unknown> = {}) {
  return { id: 'svc_a', travelRequestId: 'req_a', serviceType: 'VISA', linkedVisaApplicationId: 'visa_1', linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over }
}
function getReq() { return {} as any }

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.visaApplication.findUnique.mockResolvedValue({
    referenceNumber: 'V-100', firstName: 'Jane', lastName: 'Doe', destinationIso2: 'GB', visaType: 'tourist', status: 'under_review', statusMessage: 'Your documents are being reviewed', updatedAt: new Date('2026-01-01'),
  })
  mockPrisma.visaCaseDocument.count.mockResolvedValue(2)
})

describe('toBusinessFriendlyStatus / computeActionNeeded', () => {
  it('buckets the known raw vocabulary correctly', () => {
    expect(toBusinessFriendlyStatus('draft')).toBe('NOT_STARTED')
    expect(toBusinessFriendlyStatus('documents_pending')).toBe('ACTION_NEEDED')
    expect(toBusinessFriendlyStatus('under_review')).toBe('IN_PROGRESS')
    expect(toBusinessFriendlyStatus('submitted_to_embassy')).toBe('SUBMITTED')
    expect(toBusinessFriendlyStatus('approved')).toBe('APPROVED')
    expect(toBusinessFriendlyStatus('refused')).toBe('REJECTED')
  })

  it('fails safe to IN_PROGRESS for an unrecognized raw status (never silently APPROVED/REJECTED)', () => {
    expect(toBusinessFriendlyStatus('some_future_status')).toBe('IN_PROGRESS')
    expect(toBusinessFriendlyStatus(null)).toBe('IN_PROGRESS')
  })

  it('actionNeeded is true for ACTION_NEEDED always, and for IN_PROGRESS with zero documents', () => {
    expect(computeActionNeeded('ACTION_NEEDED', 5)).toBe(true)
    expect(computeActionNeeded('IN_PROGRESS', 0)).toBe(true)
    expect(computeActionNeeded('IN_PROGRESS', 1)).toBe(false)
    expect(computeActionNeeded('APPROVED', 0)).toBe(false)
  })
})

describe('GET visa-status — field exclusion', () => {
  it('never includes passport data, document filenames, signed URLs, or storage identifiers', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    const raw = JSON.stringify(body)
    expect(raw).not.toMatch(/passport/i)
    expect(raw).not.toMatch(/storagePath|signedUrl|bucket|fileName/i)
    // Never queries VisaCaseDocument rows for filenames — only a count().
    expect(mockPrisma.visaCaseDocument.count).toHaveBeenCalledWith({ where: { applicationId: 'visa_1' } })
  })

  it('the VisaApplication select never requests passport columns', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    await visaStatusGet(getReq(), { params })
    const select = mockPrisma.visaApplication.findUnique.mock.calls[0][0].select
    expect(select.passportNumber).toBeUndefined()
    expect(select.passportExpiryDate).toBeUndefined()
  })

  it('returns the expected business-friendly shape', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    const res = await visaStatusGet(getReq(), { params })
    const body = await res.json()
    expect(body).toEqual({
      reference: 'V-100',
      travellerDisplayName: 'Jane Doe',
      destination: 'GB',
      serviceCategory: 'VISA',
      visaType: 'tourist',
      businessStatus: 'IN_PROGRESS',
      statusMessage: 'Your documents are being reviewed',
      documentsReceivedCount: 2,
      actionNeeded: false,
      lastStatusUpdateAt: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('GET visa-status — role hierarchy', () => {
  it('COORDINATOR/ADMIN/OWNER: ordinary org-scoped visibility, no per-case ownership check', async () => {
    for (const role of ['COORDINATOR', 'TRAVEL_MANAGER', 'ADMIN', 'OWNER']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      const res = await visaStatusGet(getReq(), { params })
      expect(res.status).toBe(200)
      expect(mockPrisma.travelRequestTraveller.findFirst).not.toHaveBeenCalled()
    }
  })

  it('TRAVELLER who IS the named traveller-of-record on this request is admitted', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.travelRequestTraveller.findFirst.mockResolvedValue({ id: 'link_1' })
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(200)
    expect(mockPrisma.travelRequestTraveller.findFirst).toHaveBeenCalledWith({
      where: { travelRequestId: 'req_a', businessTraveller: { userId: USER } },
      select: { id: true },
    })
  })

  it('TRAVELLER who is NOT the traveller-of-record on this request is denied (no org-wide roster)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.travelRequestTraveller.findFirst.mockResolvedValue(null)
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaApplication.findUnique).not.toHaveBeenCalled()
  })
})

describe('GET visa-status — no case started yet', () => {
  it('returns a NOT_STARTED, non-sensitive placeholder rather than 404 when nothing is linked yet', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('COORDINATOR'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ linkedVisaApplicationId: null }))
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.businessStatus).toBe('NOT_STARTED')
    expect(mockPrisma.visaApplication.findUnique).not.toHaveBeenCalled()
  })
})

describe('GET visa-status — IDOR + REFERRAL_PARTNER deny', () => {
  it('a service from another org (prong 2) is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(
      visaService({ travelRequestId: 'req_other', travelRequest: { id: 'req_other', organizationId: ORG_B } }),
    )
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(404)
  })

  it('a non-VISA service is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'HOTEL' }))
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(404)
  })

  it('REFERRAL_PARTNER org: denied outright, even for OWNER', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.findUnique).not.toHaveBeenCalled()
  })

  it('a non-member is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await visaStatusGet(getReq(), { params })
    expect(res.status).toBe(404)
  })
})
