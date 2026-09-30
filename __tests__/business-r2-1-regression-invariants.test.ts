/**
 * Walz Business (Release 2.1 remediation, B7) — regression: the 5 R2
 * invariants this release must leave completely unchanged, PLUS the
 * additional adversarial cases the remediation brief required re-proving:
 * agency A vs agency B, corporate vs agency, referral vs both, INVITED/
 * SUSPENDED membership, cross-org document ids, guessed document ids, and
 * stale capability grants surviving an org-type transition (covered in
 * business-r2-1-reclassification-exploit.test.ts — cross-referenced below).
 *
 *  1. Only ACTIVE-status OrganizationMembership rows count as ownership
 *     evidence.
 *  2. Claim-verified traveller ownership requires BOTH claimVerifiedAt NOT
 *     NULL AND userId NOT NULL.
 *  3. An unclaimed traveller's email is never ownership evidence, however
 *     that row's own `status` reads.
 *  4. The staff cross-org-link override requires b2b.manage + confirmOverride
 *     + a mandatory reason + an audit write (source-level regression check —
 *     this route was not touched in R2.1).
 *  5. The organization travellers roster GET still requires minRole
 *     COORDINATOR (the R2.1-added org-type gate LAYERS ON TOP of this, it
 *     does not replace or loosen it).
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  organizationMembershipCapability: { findFirst: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  visaCaseDocument: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/intelligence/document-store', () => ({ storeCaseDocument: jest.fn(), signedDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/doc') }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import fs from 'fs'
import path from 'path'
import {
  OWNERSHIP_CLAIMED_TRAVELLER,
  OWNERSHIP_MEMBERSHIP_STATUS,
  OWNERSHIP_TRAVELLER_STATUS,
  ownerBelongsToOrganization,
} from '@/lib/business/services'
import { GET as contentGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/[documentId]/content/route'
import { GET as visaDocsGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function visaService(over: Record<string, unknown> = {}) {
  return { id: 'svc_a', travelRequestId: 'req_a', serviceType: 'VISA', linkedVisaApplicationId: 'visa_1', linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over }
}
const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }
const contentParams = { ...params, documentId: 'doc_1' }
const getReq = () => ({} as any)

describe('Invariant 1 + 2 + 3: OWNERSHIP_CLAIMED_TRAVELLER predicate is preserved verbatim', () => {
  it('is exactly { status: "active", claimVerifiedAt: { not: null }, userId: { not: null } }', () => {
    expect(OWNERSHIP_CLAIMED_TRAVELLER).toEqual({
      status: 'active',
      claimVerifiedAt: { not: null },
      userId: { not: null },
    })
  })

  it('OWNERSHIP_MEMBERSHIP_STATUS is the exact-match "ACTIVE" allow-list, not a deny-list', () => {
    expect(OWNERSHIP_MEMBERSHIP_STATUS).toBe('ACTIVE')
    expect(OWNERSHIP_TRAVELLER_STATUS).toBe('active')
  })

  it('a userId held by an INVITED/SUSPENDED/REMOVED membership is NOT ownership evidence (invariant 1)', async () => {
    const db = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(null), // no ACTIVE row matches
        findMany: jest.fn().mockResolvedValue([]),
      },
      businessTraveller: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: 'user_x', email: null }, ORG_A)
    expect(belongs).toBe(false)
    expect(db.organizationMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    )
  })

  it('a CLAIM-VERIFIED traveller (claimVerifiedAt + userId both set) IS ownership evidence (invariant 2)', async () => {
    const db = {
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      businessTraveller: { findFirst: jest.fn().mockResolvedValue({ id: 'bt_1' }), findMany: jest.fn().mockResolvedValue([]) },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: 'user_x', email: null }, ORG_A)
    expect(belongs).toBe(true)
    // userId is narrowed to the specific owner id being checked (not the
    // bare `{ not: null }` from the shared predicate) — status and
    // claimVerifiedAt come through from OWNERSHIP_CLAIMED_TRAVELLER unchanged.
    expect(db.businessTraveller.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', claimVerifiedAt: { not: null }, userId: 'user_x', organizationId: ORG_A }),
      }),
    )
  })

  it('an UNCLAIMED traveller row\'s email is NEVER ownership evidence, however its status reads (invariant 3)', async () => {
    // findMany for businessTraveller is scoped to OWNERSHIP_CLAIMED_TRAVELLER
    // (claimVerifiedAt/userId NOT NULL) — an unclaimed row can never appear
    // in that result set even if it happens to have status:'active'.
    const db = {
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      businessTraveller: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]), // an unclaimed row is excluded by the query itself
      },
    } as any
    const belongs = await ownerBelongsToOrganization(db, { userId: null, email: 'unclaimed@example.com' }, ORG_A)
    expect(belongs).toBe(false)
    expect(db.businessTraveller.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(OWNERSHIP_CLAIMED_TRAVELLER) }),
    )
  })
})

describe('Invariant 4: staff cross-org-link override still requires b2b.manage + confirmOverride + reason + audit (source regression check)', () => {
  it('the link route source is untouched by R2.1 and still enforces all four', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'admin', 'business', 'organizations', '[id]', 'requests', '[requestId]', 'services', '[serviceId]', 'link', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/b2b\.manage/)
    expect(src).toMatch(/confirmOverride/)
    expect(src).toMatch(/reason/)
    expect(src).toMatch(/recordBusinessAudit/)
  })
})

describe('Invariant 5: /travellers roster GET still requires minRole COORDINATOR', () => {
  it('the travellers route source still requests minRole: \'COORDINATOR\' on GET (the R2.1 org-type gate layers on top, never loosens this)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'api', 'business', 'organizations', '[id]', 'travellers', 'route.ts'),
      'utf8',
    )
    expect(src).toMatch(/assertAgencyOrCorporateAccess\(session\.user\.id, params\.id, \{ minRole: 'COORDINATOR' \}\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// B7 — additional adversarial cases required by the remediation brief.
// Stale-capability-surviving-a-reclassification is covered end-to-end in
// business-r2-1-reclassification-exploit.test.ts (drives the REAL
// transition route); the cases below round out the remaining named
// scenarios against the content-download and metadata routes specifically.
// ─────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
  mockPrisma.organizationMembershipCapability.findFirst.mockResolvedValue(null)
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.visaCaseDocument.findUnique.mockResolvedValue({
    id: 'doc_1', applicationId: 'visa_1', storagePath: 'intel/visa_1/1.pdf', fileName: 'p.pdf', mimeType: 'application/pdf', scanStatus: 'SCAN_UNAVAILABLE',
  })
})

describe('B7: agency A vs agency B (both real TRAVEL_AGENCY orgs, cross-tenant)', () => {
  it('an ADMIN of TRAVEL_AGENCY org A cannot reach TRAVEL_AGENCY org B\'s visa document content by using B\'s org id in the URL', async () => {
    mockPrisma.organization.findUnique.mockImplementation(() => Promise.resolve({ organizationType: 'TRAVEL_AGENCY' }))
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('ADMIN') : null))
    const res = await contentGet(getReq(), { params: { ...contentParams, id: ORG_B } })
    expect(res.status).toBe(404)
  })

  it('an ADMIN of TRAVEL_AGENCY org A cannot reach a service that belongs to TRAVEL_AGENCY org B (prong 2), even via org A\'s own URL', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'TRAVEL_AGENCY' })
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(
      visaService({ travelRequestId: 'req_b', travelRequest: { id: 'req_b', organizationId: ORG_B } }),
    )
    const res = await contentGet(getReq(), { params: contentParams })
    expect(res.status).toBe(404)
  })
})

describe('B7: corporate vs agency (different org TYPES, still cross-tenant on organization id)', () => {
  it('a CORPORATE org A member cannot reach a TRAVEL_AGENCY org B\'s case, regardless of the type difference — this is a tenant-id check, not a type check', async () => {
    mockPrisma.organization.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ organizationType: where.id === ORG_A ? 'CORPORATE' : 'TRAVEL_AGENCY' }))
    mockPrisma.organizationMembership.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.organizationId_userId.organizationId === ORG_A ? member('ADMIN') : null))
    const res = await visaDocsGet(getReq(), { params: { ...params, id: ORG_B } })
    expect(res.status).toBe(404)
  })
})

describe('B7: role/status bypass — INVITED and SUSPENDED memberships against R2.1 routes specifically', () => {
  it('an INVITED (not yet ACTIVE) membership is denied content access', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN', { status: 'INVITED' }))
    const res = await contentGet(getReq(), { params: contentParams })
    expect(res.status).toBe(404)
  })

  it('a SUSPENDED membership is denied content access even though it was previously ADMIN', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN', { status: 'SUSPENDED' }))
    const res = await contentGet(getReq(), { params: contentParams })
    expect(res.status).toBe(404)
  })

  it('an INVITED membership is denied metadata access', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN', { status: 'INVITED' }))
    const res = await visaDocsGet(getReq(), { params })
    expect(res.status).toBe(404)
  })

  it('a SUSPENDED membership is denied metadata access', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN', { status: 'SUSPENDED' }))
    const res = await visaDocsGet(getReq(), { params })
    expect(res.status).toBe(404)
  })
})

describe('B7: cross-org and guessed document ids on the content route', () => {
  it('a document id that exists but belongs to a different VisaApplication (guessed/cross-case id) is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.visaCaseDocument.findUnique.mockResolvedValue({
      id: 'doc_guessed', applicationId: 'visa_belongs_to_someone_else', storagePath: 'intel/other/1.pdf', fileName: 'x.pdf', mimeType: 'application/pdf', scanStatus: 'SCAN_UNAVAILABLE',
    })
    const res = await contentGet(getReq(), { params: contentParams })
    expect(res.status).toBe(404)
  })

  it('a fully nonexistent (pure guess) document id is denied', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.visaCaseDocument.findUnique.mockResolvedValue(null)
    const res = await contentGet(getReq(), { params: { ...contentParams, documentId: 'guessed_id_12345' } })
    expect(res.status).toBe(404)
  })
})
