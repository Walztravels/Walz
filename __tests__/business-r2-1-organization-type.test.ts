/**
 * Walz Business (Release 2.1) — Organization.organizationType transition.
 * Mirrors business-organization-status-route.test.ts / business-r2-currency
 * .test.ts exactly: staff b2b.manage only, reason required, CAS, audited,
 * and non-b2b.manage actors (including org members) can never reach it.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn(), updateMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { recordBusinessAudit } from '@/lib/business/audit'
import { POST } from '@/app/api/admin/business/organizations/[id]/organization-type/route'
import { VALID_ORGANIZATION_TYPES, isOrganizationType, parseOrganizationType } from '@/lib/business/organization-type'

const ORG_A = 'org_a'
// Real lib/admin/permissions::hasPermission() is used (not mocked), matching
// business-r2-currency.test.ts's own convention — these staffRole values are
// the same ones that file already relies on to carry/lack 'b2b.manage'.
const MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const VIEW_ONLY = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }
const postReq = (body: unknown) => ({ json: async () => body }) as any

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(MANAGE)
  mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A, organizationType: 'CORPORATE' })
  mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
})

describe('allow-list', () => {
  it('exactly CORPORATE | TRAVEL_AGENCY | REFERRAL_PARTNER', () => {
    expect(VALID_ORGANIZATION_TYPES).toEqual(['CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER'])
    expect(isOrganizationType('TRAVEL_AGENCY')).toBe(true)
    expect(isOrganizationType('AGENCY')).toBe(false)
    expect(parseOrganizationType(' travel_agency ')).toBe('TRAVEL_AGENCY')
    expect(parseOrganizationType(123)).toBeNull()
  })
})

describe('POST organization-type transition', () => {
  it('requires authentication', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(401)
  })

  it('non-b2b.manage staff is forbidden (403) — the ONLY route may change this field', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(VIEW_ONLY)
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(403)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an invalid organizationType', async () => {
    const res = await POST(postReq({ organizationType: 'AGENCY', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('requires a non-empty reason', async () => {
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('404s for a nonexistent organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'r' }), { params: { id: 'ghost' } })
    expect(res.status).toBe(404)
  })

  it('rejects a no-op change', async () => {
    const res = await POST(postReq({ organizationType: 'CORPORATE', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('CAS: a concurrent change loses with 409', async () => {
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 })
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(409)
  })

  it('succeeds, CAS-scoped to the previously-read value, and audits before/after with the reason', async () => {
    const res = await POST(postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'Now operating as an agency' }), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: ORG_A, organizationType: 'CORPORATE' },
      data: { organizationType: 'TRAVEL_AGENCY' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'organization.type_changed',
      organizationId: ORG_A,
      before: { organizationType: 'CORPORATE' },
      after: expect.objectContaining({ organizationType: 'TRAVEL_AGENCY', reason: 'Now operating as an agency' }),
    }))
  })
})
