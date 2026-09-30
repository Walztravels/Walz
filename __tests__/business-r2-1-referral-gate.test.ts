/**
 * Walz Business (Release 2.1) — REFERRAL_PARTNER deny-by-default gate.
 *
 * assertAgencyOrCorporateAccess() layered on assertOrgScopedAccess():
 * CORPORATE/TRAVEL_AGENCY orgs behave exactly as before; REFERRAL_PARTNER
 * orgs are denied the exact same generic 404, regardless of role — applied
 * here across the identified deny-list surfaces (travellers, visa
 * documents/submit/content). The one explicit allow — viewing your own
 * referral attribution — deliberately does NOT use this gate.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  businessTraveller: { findMany: jest.fn(), create: jest.fn() },
  travelRequestService: { findUnique: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
  visaCaseDocument: { findMany: jest.fn(), findUnique: jest.fn() },
  referralCode: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { GET as travellersGet } from '@/app/api/business/organizations/[id]/travellers/route'
import { GET as visaDocsGet } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-documents/route'
import { GET as referralGet } from '@/app/api/business/organizations/[id]/referral/route'

const ORG_A = 'org_a'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function getReq() { return {} as any }

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
})

describe('assertAgencyOrCorporateAccess', () => {
  it('CORPORATE org: behaves exactly like assertOrgScopedAccess (admits an ACTIVE member)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
    const r = await assertAgencyOrCorporateAccess(USER, ORG_A)
    expect(r.ok).toBe(true)
  })

  it('TRAVEL_AGENCY org: also admitted', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'TRAVEL_AGENCY' })
    const r = await assertAgencyOrCorporateAccess(USER, ORG_A)
    expect(r.ok).toBe(true)
  })

  it('REFERRAL_PARTNER org: denied with the SAME generic 404, regardless of role (even OWNER)', async () => {
    for (const role of ['OWNER', 'ADMIN', 'TRAVEL_MANAGER', 'COORDINATOR', 'TRAVELLER']) {
      mockPrisma.organizationMembership.findUnique.mockResolvedValue(member(role))
      mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
      expect(await assertAgencyOrCorporateAccess(USER, ORG_A)).toEqual({ ok: false, status: 404, error: 'Not found' })
    }
  })

  it('a non-member is still denied identically regardless of org type (never reaches the org-type check)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const r = await assertAgencyOrCorporateAccess(USER, ORG_A)
    expect(r).toEqual({ ok: false, status: 404, error: 'Not found' })
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it('a nonexistent organization is denied (defence in depth if organizationType lookup somehow finds nothing)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    expect(await assertAgencyOrCorporateAccess(USER, ORG_A)).toEqual({ ok: false, status: 404, error: 'Not found' })
  })
})

describe('deny-by-default applied to real routes', () => {
  it('travellers roster: REFERRAL_PARTNER org OWNER cannot list client-traveller management data', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('OWNER'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const res = await travellersGet(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessTraveller.findMany).not.toHaveBeenCalled()
  })

  it('visa-documents metadata: REFERRAL_PARTNER org ADMIN cannot reach any visa/document endpoint', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const res = await visaDocsGet(getReq(), { params: { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.travelRequestService.findUnique).not.toHaveBeenCalled()
  })
})

describe('the ONE allow-listed action: own referral attribution', () => {
  it('a REFERRAL_PARTNER org member CAN view their own referral code (deliberately unlayered assertOrgScopedAccess)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.referralCode.findUnique.mockResolvedValue({ code: 'WALZ-ABCDE-1234', uses: 2 })
    const res = await referralGet(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    // Crucially: the org-type gate is never consulted for this route.
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.referral).toEqual({ code: 'WALZ-ABCDE-1234', uses: 2 })
  })

  it('does not invent commission/payout fields — only code + uses are returned', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVELLER'))
    mockPrisma.referralCode.findUnique.mockResolvedValue({ code: 'WALZ-X', uses: 0, credits: 999 })
    const res = await referralGet(getReq(), { params: { id: ORG_A } })
    const body = await res.json()
    expect(body.referral).toEqual({ code: 'WALZ-X', uses: 0 })
    expect(JSON.stringify(body)).not.toMatch(/commission|payout|clawback|eligibility|credits/i)
  })

  it('a non-member of the org still cannot view it (identity check unaffected)', async () => {
    mockPrisma.organizationMembership.findUnique.mockResolvedValue(null)
    const res = await referralGet(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(404)
  })
})
