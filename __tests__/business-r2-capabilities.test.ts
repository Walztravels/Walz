/**
 * Walz Business (Release 2) — sensitive visa-document capability.
 *
 *  - assertSensitiveDocumentAccess() baseline is UNCHANGED (ADMIN/OWNER only,
 *    not parameterizable).
 *  - assertVisaDocumentAccess() = baseline OR an explicit un-revoked
 *    VISA_DOCUMENTS_VIEW grant on an ACTIVE, non-TRAVELLER membership of the
 *    same org. Never implicit from role; never from staff permissions.
 *  - Grants are staff-only, reason-required, audited; TRAVELLER is never
 *    grantable; cross-org membership ids 404.
 *  - The visa-documents route enforces the capability AND the two-pronged
 *    tenant check.
 */
const mockPrisma = {
  organizationMembership: { findUnique: jest.fn() },
  organizationMembershipCapability: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
  visaCaseDocument: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import fs from 'fs'
import path from 'path'
import { getAdminSession } from '@/lib/admin-auth'
import { recordBusinessAudit } from '@/lib/business/audit'
import { assertSensitiveDocumentAccess } from '@/lib/business/authz'
import { assertVisaDocumentAccess } from '@/lib/business/capabilities'
import { POST as capabilityRoute } from '@/app/api/admin/business/organizations/[id]/members/[membershipId]/capabilities/route'
import { GET as visaDocs } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
const postReq = (body: unknown) => ({ json: async () => body }) as any
const MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const VIEW = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue(null)
})

describe('baseline unchanged', () => {
  it('assertSensitiveDocumentAccess still takes exactly (userId, organizationId) — no role/minRole parameter', () => {
    expect(assertSensitiveDocumentAccess.length).toBe(2)
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'business', 'authz.ts'), 'utf8')
    expect(src).toMatch(/export async function assertSensitiveDocumentAccess\(\s*userId: string,\s*organizationId: string,\s*\)/)
  })

  it('TRAVEL_MANAGER is still denied by the baseline', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    expect((await assertSensitiveDocumentAccess(USER, ORG_A)).ok).toBe(false)
  })
})

describe('assertVisaDocumentAccess', () => {
  it('ADMIN and OWNER pass via the role baseline without needing a grant', async () => {
    for (const role of ['ADMIN', 'OWNER']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      const r = await assertVisaDocumentAccess(USER, ORG_A)
      expect(r.ok).toBe(true)
      expect(r.via).toBe('role_baseline')
    }
    expect(mockPrisma.organizationMembershipCapability.findFirst).not.toHaveBeenCalled()
  })

  it('NEVER implicit from role: TRAVEL_MANAGER/APPROVER/FINANCE/COORDINATOR without a grant are denied', async () => {
    for (const role of ['TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'COORDINATOR']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      expect(await assertVisaDocumentAccess(USER, ORG_A)).toEqual({ ok: false, status: 404, error: 'Not found' })
    }
  })

  it('an explicit un-revoked grant on THIS membership + THIS org admits a TRAVEL_MANAGER', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    const r = await assertVisaDocumentAccess(USER, ORG_A)
    expect(r.ok).toBe(true)
    expect(r.via).toBe('explicit_capability')
    expect(mockPrisma.organizationMembershipCapability.findFirst).toHaveBeenCalledWith({
      where: { membershipId: 'mem_1', organizationId: ORG_A, capability: 'VISA_DOCUMENTS_VIEW', revokedAt: null },
      select: { id: true },
    })
  })

  it('TRAVELLER is denied even if a grant row somehow exists', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_x' })
    expect((await assertVisaDocumentAccess(USER, ORG_A)).ok).toBe(false)
  })

  it('a SUSPENDED membership with a grant is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER', { status: 'SUSPENDED' }))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    expect((await assertVisaDocumentAccess(USER, ORG_A)).ok).toBe(false)
  })

  it('CROSS-ORG: a grant held in Org A never admits the member to Org B', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('TRAVEL_MANAGER') : null))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    expect((await assertVisaDocumentAccess(USER, ORG_B)).ok).toBe(false)
  })

  it('does not consult staff permissions at all (different axis)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'business', 'capabilities.ts'), 'utf8')
    expect(src).not.toMatch(/from '@\/lib\/admin\/permissions'/)
    expect(src).not.toMatch(/hasPermission\(/)
  })
})

describe('staff capability grant/revoke route', () => {
  beforeEach(() => { ;(getAdminSession as jest.Mock).mockResolvedValue(MANAGE) })

  it('denies view-only staff', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW)
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(403)
  })

  it('requires a reason', async () => {
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(400)
  })

  it('rejects unknown capabilities', async () => {
    const res = await capabilityRoute(postReq({ capability: 'EVERYTHING', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(400)
  })

  it('CROSS-ORG: an Org B membership id via the Org A URL -> 404, nothing written', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER', { id: 'mem_b', organizationId: ORG_B }))
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.organizationMembershipCapability.create).not.toHaveBeenCalled()
  })

  it('refuses to grant to TRAVELLER', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organizationMembershipCapability.create).not.toHaveBeenCalled()
  })

  it('refuses to grant to a non-ACTIVE membership', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER', { status: 'INVITED' }))
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(400)
  })

  it('grants explicitly with reason + staff actor, and audits before/after', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.create.mockResolvedValue({ id: 'cap_1' })
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'Handles visas' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(201)
    expect(mockPrisma.organizationMembershipCapability.create).toHaveBeenCalledWith({
      data: { membershipId: 'mem_1', organizationId: ORG_A, capability: 'VISA_DOCUMENTS_VIEW', grantedByStaffId: 's1', grantReason: 'Handles visas' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'membership.capability_granted', organizationId: ORG_A }))
  })

  it('a duplicate active grant -> 409', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'grant', reason: 'r' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(409)
  })

  it('revoke is a soft CAS stamp (never a delete) and is audited', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.updateMany.mockResolvedValue({ count: 1 })
    const res = await capabilityRoute(postReq({ capability: 'VISA_DOCUMENTS_VIEW', action: 'revoke', reason: 'Left role' }), { params: { id: ORG_A, membershipId: 'mem_1' } })
    expect(res.status).toBe(200)
    expect(mockPrisma.organizationMembershipCapability.updateMany).toHaveBeenCalledWith({
      where: { membershipId: 'mem_1', organizationId: ORG_A, capability: 'VISA_DOCUMENTS_VIEW', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedByStaffId: 's1', revokeReason: 'Left role' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'membership.capability_revoked' }))
  })
})

describe('GET visa-documents (capability + two-pronged tenant check)', () => {
  const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }
  function visaService(over: Record<string, unknown> = {}) {
    return { id: 'svc_a', travelRequestId: 'req_a', serviceType: 'VISA', linkedVisaApplicationId: 'visa_1', linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over }
  }
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
    mockPrisma.visaApplication.findUnique.mockResolvedValue({ id: 'visa_1', referenceNumber: 'V-1', firstName: 'J', lastName: 'D', destinationIso2: 'GB', visaType: 'tourist', status: 'submitted', passportExpiryDate: null })
    mockPrisma.visaCaseDocument.findMany.mockResolvedValue([{ id: 'd1', documentType: 'passport', fileName: 'p.pdf', mimeType: 'application/pdf', fileSize: 1, createdAt: new Date() }])
  })

  it('non-member denied (404)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaCaseDocument.findMany).not.toHaveBeenCalled()
  })

  it('TRAVEL_MANAGER without a grant denied (404)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.findUnique).not.toHaveBeenCalled()
  })

  it('Org A member targeting Org B URL denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('ADMIN') : null))
    const res = await visaDocs({} as any, { params: { ...params, id: ORG_B } })
    expect(res.status).toBe(404)
  })

  it('Org A ADMIN + Org B service id via Org A URL -> 404 (prong 2)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ travelRequestId: 'req_b', travelRequest: { id: 'req_b', organizationId: ORG_B } }))
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaCaseDocument.findMany).not.toHaveBeenCalled()
  })

  it('a service from another request of the same org is rejected (requestId must match)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ travelRequestId: 'req_other', travelRequest: { id: 'req_other', organizationId: ORG_A } }))
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(404)
  })

  it('ADMIN gets metadata only (no storage path) and the view is audited', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toMatch(/storagePath|bucket/)
    expect(mockPrisma.visaCaseDocument.findMany.mock.calls[0][0].select.storagePath).toBeUndefined()
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'visa_documents.viewed', organizationId: ORG_A }))
  })

  it('TRAVEL_MANAGER WITH an explicit grant is admitted', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
    mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue({ id: 'cap_1' })
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
    const res = await visaDocs({} as any, { params })
    expect(res.status).toBe(200)
  })
})
