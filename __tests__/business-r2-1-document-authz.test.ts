/**
 * Walz Business (Release 2.1) — the three-way document-authorization split.
 *
 *  1. SUBMIT (assertCanSubmitVisaDocuments) — scoped to one case, not
 *     org-wide, NOT gated by VISA_DOCUMENTS_VIEW.
 *  2. METADATA — broad ACTIVE-member visibility (tested in
 *     business-r2-capabilities.test.ts's updated GET visa-documents suite).
 *  3. CONTENT VIEW/DOWNLOAD — the new surface, gated behind the UNCHANGED
 *     assertVisaDocumentAccess() baseline. IDOR: cross-case / cross-org
 *     document ids must never resolve.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  organizationMembershipCapability: { findFirst: jest.fn() },
  travelRequestService: { findUnique: jest.fn(), update: jest.fn() },
  visaApplication: { findUnique: jest.fn(), create: jest.fn() },
  visaCaseDocument: { findUnique: jest.fn(), findMany: jest.fn() },
  travelRequestServiceAttestation: { create: jest.fn() },
  travelRequestTraveller: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: jest.fn().mockResolvedValue({ ok: true, doc: { documentId: 'doc_1', storagePath: 'intel/x', checksum: 'abc' } }),
  signedDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/doc?download=1'),
}))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { assertCanSubmitVisaDocuments } from '@/lib/business/document-authz'
import { signedDocumentUrl } from '@/lib/intelligence/document-store'
import { GET as contentGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/[documentId]/content/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

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
  mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue(null)
})

describe('SUBMIT gate: assertCanSubmitVisaDocuments — scoped, not org-wide, not capability-gated', () => {
  it('an ACTIVE member of any role may submit for a VISA service they can reach (no VISA_DOCUMENTS_VIEW required)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
    const r = await assertCanSubmitVisaDocuments(USER, ORG_A, 'req_a', 'svc_a')
    expect(r.ok).toBe(true)
    // Never consults the capability table — submission is a different axis.
    expect(mockPrisma.organizationMembershipCapability.findFirst).not.toHaveBeenCalled()
  })

  it('denies a non-VISA service (e.g. FLIGHT) — submission only makes sense for visa cases', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'FLIGHT' }))
    const r = await assertCanSubmitVisaDocuments(USER, ORG_A, 'req_a', 'svc_a')
    expect(r.ok).toBe(false)
  })

  it('IDOR: a service from another request/org (prong 2) is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(
      visaService({ travelRequestId: 'req_other', travelRequest: { id: 'req_other', organizationId: ORG_B } }),
    )
    const r = await assertCanSubmitVisaDocuments(USER, ORG_A, 'req_a', 'svc_a')
    expect(r.ok).toBe(false)
  })

  it('REFERRAL_PARTNER org: submission is denied outright (on the deny-list)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const r = await assertCanSubmitVisaDocuments(USER, ORG_A, 'req_a', 'svc_a')
    expect(r.ok).toBe(false)
    expect(mockPrisma.travelRequestService.findUnique).not.toHaveBeenCalled()
  })

  it('a non-member is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const r = await assertCanSubmitVisaDocuments(USER, ORG_A, 'req_a', 'svc_a')
    expect(r.ok).toBe(false)
  })
})

describe('CONTENT VIEW/DOWNLOAD route (new surface): gated by the UNCHANGED assertVisaDocumentAccess baseline', () => {
  const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a', documentId: 'doc_1' }

  beforeEach(() => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
    mockPrisma.visaCaseDocument.findUnique.mockResolvedValue({
      id: 'doc_1', applicationId: 'visa_1', storagePath: 'intel/visa_1/1.pdf', fileName: 'passport.pdf', mimeType: 'application/pdf', scanStatus: 'SCAN_UNAVAILABLE',
    })
  })

  it('ADMIN gets a force-download signed URL via the role baseline', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    const res = await contentGet(getReq(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://signed.example/doc?download=1')
    // Forced-download filename was passed through to signedDocumentUrl.
    expect((signedDocumentUrl as jest.Mock).mock.calls[0][2]).toBe('passport.pdf')
  })

  it('TRAVEL_MANAGER WITHOUT a VISA_DOCUMENTS_VIEW grant is denied content — NOT auto-granted just by role/relationship', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    const res = await contentGet(getReq(), { params })
    expect(res.status).toBe(404)
    expect(signedDocumentUrl).not.toHaveBeenCalled()
  })

  it('TRAVEL_MANAGER WITH an explicit VISA_DOCUMENTS_VIEW grant IS admitted', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    const res = await contentGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('IDOR: a documentId that belongs to a DIFFERENT VisaApplication (cross-case) never resolves, even for an ADMIN', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.visaCaseDocument.findUnique.mockResolvedValue({
      id: 'doc_1', applicationId: 'visa_OTHER', storagePath: 'intel/visa_other/1.pdf', fileName: 'p.pdf', mimeType: 'application/pdf', scanStatus: 'SCAN_UNAVAILABLE',
    })
    const res = await contentGet(getReq(), { params })
    expect(res.status).toBe(404)
    expect(signedDocumentUrl).not.toHaveBeenCalled()
  })

  it('IDOR: cross-org — an Org A member using an Org B URL is denied before the document is ever looked up', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('ADMIN') : null))
    const res = await contentGet(getReq(), { params: { ...params, id: ORG_B } })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaCaseDocument.findUnique).not.toHaveBeenCalled()
  })

  it('a nonexistent document 404s', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.visaCaseDocument.findUnique.mockResolvedValue(null)
    const res = await contentGet(getReq(), { params })
    expect(res.status).toBe(404)
  })
})
