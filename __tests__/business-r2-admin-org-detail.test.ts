/**
 * Walz Business (Release 2) — staff organization-detail endpoints under
 * /api/admin/business/organizations/[id]/**.
 *
 * Staff are platform-wide operators, so for admin routes:
 *   - "non-member denied"  = staff WITHOUT the b2b permission get 403 (and
 *     unauthenticated callers 401), with no data read;
 *   - "Org A targeting Org B" = every list is queried strictly by the URL's
 *     organization id, and any nested sub-resource id belonging to another
 *     organization collapses to a generic 404.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn(), updateMany: jest.fn() },
  organizationMembership: { findMany: jest.fn(), count: jest.fn() },
  businessTraveller: { findMany: jest.fn(), count: jest.fn() },
  travelRequest: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  travelRequestService: { findMany: jest.fn() },
  businessAuditLog: { findMany: jest.fn() },
  staff: { findUnique: jest.fn(), findMany: jest.fn() },
  user: { findMany: jest.fn() },
  quote: { findMany: jest.fn() },
  visaApplication: { findMany: jest.fn() },
  itinerary: { findMany: jest.fn() },
  trip: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

import fs from 'fs'
import path from 'path'
import { getAdminSession } from '@/lib/admin-auth'
import { recordBusinessAudit } from '@/lib/business/audit'
import { GET as getOverview } from '@/app/api/admin/business/organizations/[id]/route'
import { GET as getMembers } from '@/app/api/admin/business/organizations/[id]/members/route'
import { GET as getTravellers } from '@/app/api/admin/business/organizations/[id]/travellers/route'
import { GET as getRequests } from '@/app/api/admin/business/organizations/[id]/requests/route'
import { GET as getRequestDetail } from '@/app/api/admin/business/organizations/[id]/requests/[requestId]/route'
import { GET as getServices } from '@/app/api/admin/business/organizations/[id]/services/route'
import { GET as getAudit } from '@/app/api/admin/business/organizations/[id]/audit/route'
import { POST as changeAccountManager } from '@/app/api/admin/business/organizations/[id]/account-manager/route'
import { GET as staffSearch } from '@/app/api/admin/business/staff-search/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'

const SESSION_MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const SESSION_VIEW = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }
const SESSION_NONE = { id: 's3', staffId: 's3', email: 'support@walztravels.com', role: 'customer_support', staffRole: 'customer_support', permissions: {} }

function getReq(search: Record<string, string> = {}) {
  return { nextUrl: { searchParams: new URLSearchParams(search) } } as any
}
function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW)
  // Only ORG_A and ORG_B exist.
  mockPrisma.organization.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve([ORG_A, ORG_B].includes(where.id) ? { id: where.id, legalName: `Legal ${where.id}`, accountManagerId: null, defaultCurrency: 'GBP' } : null))
  mockPrisma.organizationMembership.findMany.mockResolvedValue([])
  mockPrisma.organizationMembership.count.mockResolvedValue(0)
  mockPrisma.businessTraveller.findMany.mockResolvedValue([])
  mockPrisma.businessTraveller.count.mockResolvedValue(0)
  mockPrisma.travelRequest.findMany.mockResolvedValue([])
  mockPrisma.travelRequest.count.mockResolvedValue(0)
  mockPrisma.travelRequestService.findMany.mockResolvedValue([])
  mockPrisma.businessAuditLog.findMany.mockResolvedValue([])
  mockPrisma.user.findMany.mockResolvedValue([])
})

type Handler = (req: any, ctx: any) => Promise<Response>
const LIST_ENDPOINTS: Array<[string, Handler]> = [
  ['overview', getOverview as Handler],
  ['members', getMembers as Handler],
  ['travellers', getTravellers as Handler],
  ['requests', getRequests as Handler],
  ['services', getServices as Handler],
  ['audit', getAudit as Handler],
]

describe.each(LIST_ENDPOINTS)('admin GET %s — access + tenant isolation', (_name, handler) => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await handler(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(401)
  })

  it('denies staff without b2b (non-member of the B2B surface) with 403 and reads nothing', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_NONE)
    const res = await handler(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(403)
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for an organization id that does not exist', async () => {
    const res = await handler(getReq(), { params: { id: 'org_missing' } })
    expect(res.status).toBe(404)
  })

  it('Org A targeting Org B: every query is scoped to the URL org only, never another org', async () => {
    const res = await handler(getReq(), { params: { id: ORG_B } })
    expect(res.status).toBe(200)
    const allCalls = [
      ...mockPrisma.organizationMembership.findMany.mock.calls,
      ...mockPrisma.organizationMembership.count.mock.calls,
      ...mockPrisma.businessTraveller.findMany.mock.calls,
      ...mockPrisma.businessTraveller.count.mock.calls,
      ...mockPrisma.travelRequest.findMany.mock.calls,
      ...mockPrisma.travelRequest.count.mock.calls,
      ...mockPrisma.businessAuditLog.findMany.mock.calls,
    ]
    for (const [args] of allCalls) {
      expect(args.where.organizationId).toBe(ORG_B)
    }
    for (const [args] of mockPrisma.travelRequestService.findMany.mock.calls) {
      expect(args.where.travelRequest.organizationId).toBe(ORG_B)
    }
  })
})

describe('admin GET services — defence in depth', () => {
  it('drops any service row whose parent request is not the URL org', async () => {
    mockPrisma.travelRequestService.findMany.mockResolvedValue([
      { id: 'svc_a', serviceType: 'FLIGHT', createdAt: new Date(), linkedQuoteId: null, linkedVisaApplicationId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', title: 'A', organizationId: ORG_A } },
      { id: 'svc_b', serviceType: 'FLIGHT', createdAt: new Date(), linkedQuoteId: null, linkedVisaApplicationId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_b', title: 'B', organizationId: ORG_B } },
    ])
    const res = await getServices(getReq(), { params: { id: ORG_A } })
    const body = await res.json()
    expect(body.services.map((s: any) => s.id)).toEqual(['svc_a'])
  })
})

describe('admin GET travellers — never leaks token or userId', () => {
  it('returns only a derived claimState', async () => {
    mockPrisma.businessTraveller.findMany.mockResolvedValue([
      { id: 't1', firstName: 'A', lastName: 'B', email: 'a@x.com', phone: null, status: 'active', createdBy: 'x', createdAt: new Date(), userId: 'user_secret', claimVerificationToken: 'f'.repeat(64), claimTokenExpiresAt: new Date(Date.now() + 1000), claimVerifiedAt: null },
    ])
    const res = await getTravellers(getReq(), { params: { id: ORG_A } })
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('user_secret')
    expect(text).not.toContain('f'.repeat(64))
    expect(text).toContain('"claimState":"claimed"')
  })
})

describe('admin GET request detail — cross-org sub-resource', () => {
  it('denies staff without b2b', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_NONE)
    const res = await getRequestDetail(getReq(), { params: { id: ORG_A, requestId: 'req_b' } })
    expect(res.status).toBe(403)
  })

  it('Org A URL + Org B request id -> generic 404', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({ id: 'req_b', organizationId: ORG_B, travellers: [], services: [], approvals: [] })
    const res = await getRequestDetail(getReq(), { params: { id: ORG_A, requestId: 'req_b' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.businessAuditLog.findMany).not.toHaveBeenCalled()
  })

  it('returns the detail when the request belongs to the URL org', async () => {
    mockPrisma.travelRequest.findUnique.mockResolvedValue({
      id: 'req_a', organizationId: ORG_A, submittedByMembershipId: 'm1', title: 'T', notes: null, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(),
      submittedBy: { id: 'm1', role: 'TRAVEL_MANAGER', user: { name: 'Req', email: 'r@x.com' } }, travellers: [], services: [], approvals: [],
    })
    const res = await getRequestDetail(getReq(), { params: { id: ORG_A, requestId: 'req_a' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.request.title).toBe('T')
    expect(mockPrisma.businessAuditLog.findMany.mock.calls[0][0].where.organizationId).toBe(ORG_A)
  })
})

describe('audit timeline is append-only', () => {
  it('the audit route exports GET only — no PUT/PATCH/DELETE/POST', () => {
    const mod = require('@/app/api/admin/business/organizations/[id]/audit/route')
    expect(typeof mod.GET).toBe('function')
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(mod[verb]).toBeUndefined()
  })

  it('no file in the B2B domain updates or deletes business_audit_log rows', () => {
    const { execSync } = require('child_process')
    const out: string = execSync(
      `grep -rlE "businessAuditLog\\.(update|updateMany|delete|deleteMany|upsert)" app lib --include='*.ts' --include='*.tsx' || true`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
    )
    expect(out.trim()).toBe('')
  })

  it('the admin Audit tab UI has no edit/delete controls', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'business', '[orgId]', 'page.tsx'), 'utf8')
    const auditTab = src.slice(src.indexOf('function AuditTab'))
    expect(auditTab).not.toMatch(/method:\s*'(DELETE|PATCH|PUT)'/)
    expect(auditTab).not.toMatch(/postJson\(/)
    expect(auditTab).toMatch(/cannot be edited or deleted/)
  })

  it('maps actor/reason/before/after for display', async () => {
    mockPrisma.businessAuditLog.findMany.mockResolvedValue([
      { id: 'a1', createdAt: new Date('2026-09-01T10:00:00Z'), action: 'organization.currency_changed', entityType: 'Organization', entityId: ORG_A, actorStaffId: 'ops@walztravels.com', actorUserId: null, before: { defaultCurrency: 'GBP' }, after: { defaultCurrency: 'CAD', reason: 'x' } },
    ])
    const res = await getAudit(getReq(), { params: { id: ORG_A } })
    const body = await res.json()
    expect(body.entries[0]).toEqual(expect.objectContaining({ actorType: 'staff', actor: 'ops@walztravels.com', before: { defaultCurrency: 'GBP' } }))
  })
})

describe('POST account-manager (search/select UI; server stays authoritative)', () => {
  beforeEach(() => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_MANAGE)
  })

  it('denies view-only staff (no b2b.manage)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW)
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'x@walztravels.com', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(403)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'x@walztravels.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('rejects a nonexistent Staff email even if the UI sent it', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue(null)
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'ghost@walztravels.com', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an inactive Staff email', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ email: 'old@walztravels.com', isActive: false })
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'old@walztravels.com', reason: 'r' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('assigns a verified active Staff email with CAS + before/after audit', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ email: 'am@walztravels.com', isActive: true })
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A, accountManagerId: null })
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'AM@walztravels.com', reason: 'New AM' }), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: ORG_A, accountManagerId: null }, data: { accountManagerId: 'am@walztravels.com' } })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'organization.account_manager_changed', before: { accountManagerId: null }, after: { accountManagerId: 'am@walztravels.com', reason: 'New AM' },
    }))
  })

  it('404s for an unknown organization', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ email: 'am@walztravels.com', isActive: true })
    const res = await changeAccountManager(postReq({ accountManagerEmail: 'am@walztravels.com', reason: 'r' }), { params: { id: 'org_missing' } })
    expect(res.status).toBe(404)
  })

  it('the admin detail page uses the StaffPicker search, not a free-text staff id field', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'business', '[orgId]', 'page.tsx'), 'utf8')
    expect(src).toMatch(/<StaffPicker/)
    expect(src).not.toMatch(/placeholder="[^"]*Staff ID/i)
  })
})

// R2.2 SLICE A — organization type: admin overview surfaces + the
// reclassification UI calling the EXISTING [id]/organization-type/route.ts
// (never a second/replacement write path).
describe('admin overview — organizationType (R2.2 Slice A)', () => {
  beforeEach(() => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW)
  })

  it('GET overview returns organizationType as part of the full organization record', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: ORG_A, legalName: 'Legal org_a', accountManagerId: null, defaultCurrency: 'GBP', organizationType: 'TRAVEL_AGENCY',
    })
    const res = await getOverview(getReq(), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.organization.organizationType).toBe('TRAVEL_AGENCY')
  })
})

describe('admin UI — organization-type reclassification panel (reuses the existing endpoint only)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'business', '[orgId]', 'page.tsx'), 'utf8')

  it('posts to the existing [id]/organization-type endpoint via the shared postJson/ReasonForm helpers', () => {
    expect(src).toMatch(/postJson\(`\$\{base\}\/organization-type`, \{ organizationType, reason \}\)/)
    expect(src).toMatch(/<ReasonForm/)
  })

  it('does not introduce any other write path for organizationType (no raw fetch/PATCH to a different URL)', () => {
    const panel = src.slice(src.indexOf('Panel title="Organization type"'))
    const nextPanelEnd = panel.indexOf('</Panel>')
    const panelBody = panel.slice(0, nextPanelEnd === -1 ? undefined : nextPanelEnd)
    expect(panelBody).not.toMatch(/fetch\(/)
    expect(panelBody.match(/organization-type/g)?.length).toBe(1)
  })

  it('offers exactly the closed list of organization types in the reclassification select', () => {
    expect(src).toMatch(/VALID_ORGANIZATION_TYPES\.map\(t => <option/)
  })

  it('displays organizationType as a Badge in the header, alongside status/currency', () => {
    const header = src.slice(src.indexOf('<h1 className="text-white text-xl font-bold">'), src.indexOf('</div>', src.indexOf('<h1 className="text-white text-xl font-bold">')))
    expect(header).toMatch(/org\.organizationType/)
  })
})

describe('GET staff-search', () => {
  it('denies view-only staff', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW)
    const res = await staffSearch(getReq({ q: 'ann' }))
    expect(res.status).toBe(403)
  })

  it('searches ACTIVE staff only and returns no auth fields', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_MANAGE)
    mockPrisma.staff.findMany.mockResolvedValue([{ name: 'Ann', email: 'ann@walztravels.com', roleTitle: 'AM' }])
    const res = await staffSearch(getReq({ q: 'ann' }))
    expect(res.status).toBe(200)
    const args = mockPrisma.staff.findMany.mock.calls[0][0]
    expect(args.where.isActive).toBe(true)
    expect(Object.keys(args.select).sort()).toEqual(['email', 'name', 'roleTitle'])
  })

  it('returns nothing for queries shorter than 2 chars', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_MANAGE)
    const res = await staffSearch(getReq({ q: 'a' }))
    expect((await res.json()).staff).toEqual([])
    expect(mockPrisma.staff.findMany).not.toHaveBeenCalled()
  })
})
