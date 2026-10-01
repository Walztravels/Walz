/**
 * Walz Business (Release 1) — /api/admin/business/organizations
 * GET requires 'b2b'. POST requires 'b2b.manage'. This is the ONLY
 * organization-creation path in Release 1.
 *
 * Release 2: defaultCurrency is now REQUIRED at creation (no silent GBP
 * fallback), so every creation call below supplies it explicitly. The R2
 * currency rules themselves are covered in business-r2-currency.test.ts.
 */
const mockPrisma = {
  organization: { findMany: jest.fn(), create: jest.fn() },
  staff: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

import { getAdminSession } from '@/lib/admin-auth'
import { GET, POST } from '@/app/api/admin/business/organizations/route'
import { recordBusinessAudit } from '@/lib/business/audit'

function getReq(searchParams: Record<string, string> = {}) {
  return { nextUrl: { searchParams: new URLSearchParams(searchParams) } } as unknown as Parameters<typeof GET>[0]
}
function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const SESSION_WITH_MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const SESSION_VIEW_ONLY = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }
const SESSION_NO_ACCESS = { id: 's3', staffId: 's3', email: 'support@walztravels.com', role: 'customer_support', staffRole: 'customer_support', permissions: {} }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET organizations (staff)', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await GET(getReq())
    expect(res.status).toBe(401)
  })

  it('denies a staff role without b2b (customer_support)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_NO_ACCESS)
    const res = await GET(getReq())
    expect(res.status).toBe(403)
  })

  it('allows a view-only b2b role (senior_manager)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW_ONLY)
    mockPrisma.organization.findMany.mockResolvedValue([])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
  })

  it('allows operations_manager (has b2b.manage, which implies b2b for our purposes)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org_1', legalName: 'Acme' }])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.organizations).toHaveLength(1)
  })
})

describe('POST create organization (staff-only path)', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
    expect(res.status).toBe(401)
  })

  it('denies a view-only b2b role (senior_manager lacks b2b.manage)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW_ONLY)
    const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
    expect(res.status).toBe(403)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
  })

  it('denies a role without b2b at all', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_NO_ACCESS)
    const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
    expect(res.status).toBe(403)
  })

  it('rejects a missing required field', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    const res = await POST(postReq({ country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
  })

  it('creates an organization with b2b.manage and records an audit row — always status ONBOARDING', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    mockPrisma.organization.create.mockResolvedValue({ id: 'org_1', legalName: 'Acme Ltd', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING' })

    const res = await POST(postReq({ legalName: 'Acme Ltd', country: 'GB', businessEmail: 'A@Acme.com', defaultCurrency: 'GBP' }))
    expect(res.status).toBe(201)
    expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ legalName: 'Acme Ltd', businessEmail: 'a@acme.com', status: 'ONBOARDING', defaultCurrency: 'GBP' }),
    }))
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.create' }))
  })

  // SECURITY FIX (delta review, MEDIUM finding): a client-supplied `status`
  // can no longer set anything but the hardcoded ONBOARDING creation value —
  // it is silently ignored rather than rejected, since accepting-but-
  // ignoring is simpler and equally safe (a caller cannot use this field to
  // achieve any effect at all, valid or invalid).
  it('silently ignores a client-supplied status field — creation is always ONBOARDING regardless', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    mockPrisma.organization.create.mockResolvedValue({ id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING' })

    const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ACTIVE' }))
    expect(res.status).toBe(201)
    expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ONBOARDING' }),
    }))
  })

  it('silently ignores even an invalid/bogus status value — no 400, just ignored', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    mockPrisma.organization.create.mockResolvedValue({ id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING' })

    const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'BOGUS' }))
    expect(res.status).toBe(201)
    expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ONBOARDING' }),
    }))
  })

  describe('accountManagerId verification (SECURITY FIX, delta review)', () => {
    it('rejects a non-existent Staff email', async () => {
      ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
      mockPrisma.staff.findUnique.mockResolvedValue(null)

      const res = await POST(postReq({
        legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', accountManagerId: 'ghost@walztravels.com',
      }))
      expect(res.status).toBe(400)
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('rejects an inactive Staff email', async () => {
      ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
      mockPrisma.staff.findUnique.mockResolvedValue({ email: 'exstaff@walztravels.com', isActive: false })

      const res = await POST(postReq({
        legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', accountManagerId: 'exstaff@walztravels.com',
      }))
      expect(res.status).toBe(400)
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('accepts and stores a verified active Staff email', async () => {
      ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
      mockPrisma.staff.findUnique.mockResolvedValue({ email: 'ops@walztravels.com', isActive: true })
      mockPrisma.organization.create.mockResolvedValue({ id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING' })

      const res = await POST(postReq({
        legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', accountManagerId: 'OPS@Walztravels.com',
      }))
      expect(res.status).toBe(201)
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accountManagerId: 'ops@walztravels.com' }),
      }))
    })

    it('omits accountManagerId entirely when not supplied — no Staff lookup performed', async () => {
      ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
      mockPrisma.organization.create.mockResolvedValue({ id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING' })

      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
      expect(res.status).toBe(201)
      expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accountManagerId: null }),
      }))
    })
  })

  // R2.2 SLICE A: organization type at creation. Optional, defaults to
  // DEFAULT_ORGANIZATION_TYPE (CORPORATE) when omitted or an empty string;
  // rejected with 400 when present but not one of VALID_ORGANIZATION_TYPES.
  describe('organizationType at creation', () => {
    beforeEach(() => {
      ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
      mockPrisma.organization.create.mockResolvedValue({
        id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING', organizationType: 'CORPORATE',
      })
    })

    it('defaults to CORPORATE when organizationType is omitted entirely', async () => {
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
      expect(res.status).toBe(201)
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ organizationType: 'CORPORATE' }),
      }))
    })

    it('defaults to CORPORATE when organizationType is an empty string', async () => {
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', organizationType: '   ' }))
      expect(res.status).toBe(201)
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ organizationType: 'CORPORATE' }),
      }))
    })

    it('accepts a valid, non-default organizationType (case/whitespace tolerant, like the reclassification route)', async () => {
      mockPrisma.organization.create.mockResolvedValue({
        id: 'org_1', legalName: 'Acme', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', status: 'ONBOARDING', organizationType: 'TRAVEL_AGENCY',
      })
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', organizationType: ' travel_agency ' }))
      expect(res.status).toBe(201)
      expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ organizationType: 'TRAVEL_AGENCY' }),
      }))
    })

    it('rejects an invalid organizationType with 400 and never calls create', async () => {
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', organizationType: 'AGENCY' }))
      expect(res.status).toBe(400)
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('rejects a non-string organizationType with 400', async () => {
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP', organizationType: 123 }))
      expect(res.status).toBe(400)
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('adds organizationType to the organization.create audit after payload (additive detail on the existing organization.create action)', async () => {
      const res = await POST(postReq({ legalName: 'Acme', country: 'GB', businessEmail: 'a@acme.com', defaultCurrency: 'GBP' }))
      expect(res.status).toBe(201)
      expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'organization.create',
        after: expect.objectContaining({ organizationType: 'CORPORATE' }),
      }))
    })
  })
})

describe('GET organizations — ?type= filter (R2.2 Slice A)', () => {
  beforeEach(() => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
    mockPrisma.organization.findMany.mockResolvedValue([])
  })

  it('with no ?type= param, filters nothing by organizationType', async () => {
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const args = mockPrisma.organization.findMany.mock.calls[0][0]
    expect(args.where).toBeUndefined()
  })

  it('with a valid ?type=, filters where.organizationType (case/whitespace tolerant)', async () => {
    const res = await GET(getReq({ type: ' travel_agency ' }))
    expect(res.status).toBe(200)
    const args = mockPrisma.organization.findMany.mock.calls[0][0]
    expect(args.where).toEqual(expect.objectContaining({ organizationType: 'TRAVEL_AGENCY' }))
  })

  it('with an invalid ?type=, fails closed with 400 and never queries', async () => {
    const res = await GET(getReq({ type: 'AGENCY' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.findMany).not.toHaveBeenCalled()
  })

  it('combines ?query= and ?type= together', async () => {
    const res = await GET(getReq({ query: 'acme', type: 'CORPORATE' }))
    expect(res.status).toBe(200)
    const args = mockPrisma.organization.findMany.mock.calls[0][0]
    expect(args.where.organizationType).toBe('CORPORATE')
    expect(args.where.OR).toBeDefined()
  })
})
