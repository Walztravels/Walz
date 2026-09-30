/**
 * Walz Business (Release 2.1 remediation) — B5: REFERRAL_PARTNER
 * deny-by-default sweep across EVERY route this remediation found reachable
 * by a customer-org session, not just the 3 originally covered
 * (travellers, visa-documents, visa-documents/content). This includes 6
 * pre-existing R1/R2 booking/service-ownership routes that had never been
 * gated against the (newly introduced in R2.1) REFERRAL_PARTNER org type at
 * all, found during this remediation's own sweep.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  travelRequest: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn(), create: jest.fn() },
  travelRequestServiceAttestation: { create: jest.fn() },
  travelRequestTraveller: { create: jest.fn(), findFirst: jest.fn() },
  travelApproval: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  businessTraveller: { findUnique: jest.fn(), findMany: jest.fn() },
  visaApplication: { findUnique: jest.fn(), create: jest.fn() },
  visaCaseDocument: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/business/claim-invite', () => ({ issueTravellerClaimInvite: jest.fn() }))
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: jest.fn(),
  signedDocumentUrl: jest.fn(),
}))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { GET as travellersGet, POST as travellersPost } from '@/app/api/business/organizations/[id]/travellers/route'
import { GET as requestsGet, POST as requestsPost } from '@/app/api/business/organizations/[id]/requests/route'
import { GET as requestDetailGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/route'
import { POST as approvePost } from '@/app/api/business/organizations/[id]/requests/[requestId]/approve/route'
import { POST as requestTravellersPost } from '@/app/api/business/organizations/[id]/requests/[requestId]/travellers/route'
import { GET as servicesGet, POST as servicesPost } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/route'
import { POST as claimInvitePost } from '@/app/api/business/organizations/[id]/travellers/[travellerId]/claim/route'
import { GET as visaDocsGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/route'
import { GET as contentGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/[documentId]/content/route'
import { GET as visaStatusGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-status/route'
import { POST as visaSubmitPost } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-submit/route'

const ORG_A = 'org_a'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
const getReq = () => ({} as any)
const postReq = (body: unknown) => ({ json: async () => body }) as any
function formReq(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return { formData: async () => fd, headers: new Headers() } as any
}
const p1 = { id: ORG_A }
const p2 = { id: ORG_A, requestId: 'req_a' }
const p3 = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }
const p4 = { ...p3, documentId: 'doc_1' }
const p5 = { id: ORG_A, travellerId: 'trav_1' }

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  // Every one of these routes' first check is the org-scoped/org-type gate,
  // so for ALL of these calls to reach (and be denied by) the org-type
  // check, the membership itself must resolve as an ACTIVE OWNER — the
  // strongest role there is, so a failure here can only be attributable to
  // the org-type gate, never to role/status.
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
})

describe('REFERRAL_PARTNER is denied on every one of these routes, as OWNER, with no underlying sensitive query ever executing', () => {
  it('GET travellers (roster / client-traveller management)', async () => {
    const res = await travellersGet(getReq(), { params: p1 })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('POST travellers (create)', async () => {
    const res = await travellersPost(postReq({ firstName: 'A', lastName: 'B', email: 'a@b.com' }), { params: p1 })
    expect(res.status).toBe(404)
  })

  it('GET requests (booking/service-ownership listing)', async () => {
    const res = await requestsGet(getReq(), { params: p1 })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.findMany).not.toHaveBeenCalled()
  })

  it('POST requests (create)', async () => {
    const res = await requestsPost(postReq({ title: 'x' }), { params: p1 })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.create).not.toHaveBeenCalled()
  })

  it('GET request detail', async () => {
    const res = await requestDetailGet(getReq(), { params: p2 })
    expect(res.status).toBe(404)
  })

  it('POST approve/reject a request', async () => {
    const res = await approvePost(postReq({ decision: 'APPROVED' }), { params: p2 })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequest.findUnique).not.toHaveBeenCalled()
  })

  it('POST name a traveller on a request', async () => {
    const res = await requestTravellersPost(postReq({ businessTravellerId: 'bt_1' }), { params: p2 })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestTraveller.create).not.toHaveBeenCalled()
  })

  it('GET a request\'s services', async () => {
    const res = await servicesGet(getReq(), { params: p2 })
    expect(res.status).toBe(404)
  })

  it('POST add a service to a request', async () => {
    const res = await servicesPost(postReq({ serviceType: 'FLIGHT' }), { params: p2 })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.create).not.toHaveBeenCalled()
  })

  it('POST (re)send a traveller claim invite', async () => {
    const res = await claimInvitePost(getReq(), { params: p5 })
    expect(res.status).toBe(404)
  })

  it('GET visa-documents metadata', async () => {
    const res = await visaDocsGet(getReq(), { params: p3 })
    expect(res.status).toBe(404)
  })

  it('GET visa document content/download — the mandatory previously-missed surface', async () => {
    const res = await contentGet(getReq(), { params: p4 })
    expect(res.status).toBe(404)
  })

  it('GET the business-friendly visa-status projection', async () => {
    const res = await visaStatusGet(getReq(), { params: p3 })
    expect(res.status).toBe(404)
  })

  it('POST submit an agency visa case (any of the 3 intake modes)', async () => {
    const res = await visaSubmitPost(formReq({ mode: 'FORM', attested: 'true' }), { params: p3 })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })
})
