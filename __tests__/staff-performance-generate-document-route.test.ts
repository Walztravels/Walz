/**
 * POST /api/admin/performance/cases/[caseId]/documents — Generate Warning
 * (mission brief §5). Facts are pre-populated from authoritative records;
 * the resulting document always starts as DRAFT and nothing is ever sent.
 */
const mockPrisma = {
  staffPerformanceCase: { findUnique: jest.fn() },
  staff: { findUnique: jest.fn() },
  staffPerformanceDocument: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/sales', () => ({
  computeStaffSalesSummary: jest.fn(),
  computeSalesInPeriod: jest.fn(),
}))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { computeStaffSalesSummary, computeSalesInPeriod } from '@/lib/performance/sales'
import { POST } from '@/app/api/admin/performance/cases/[caseId]/documents/route'

const SUPER_ADMIN = { id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' }
const CASE = {
  id: 'case1',
  staffId: 's2',
  reviewPeriodStart: new Date('2026-05-01'),
  reviewPeriodEnd: new Date('2026-08-29'),
}
const STAFF = { id: 's2', name: 'Jane Doe', roleTitle: 'Senior Sales Agent', department: 'sales' }

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
const ctx = { params: { caseId: 'case1' } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staffPerformanceCase.findUnique.mockResolvedValue(CASE)
  mockPrisma.staff.findUnique.mockResolvedValue(STAFF)
  ;(computeStaffSalesSummary as jest.Mock).mockResolvedValue({ lastCompletedSaleAt: new Date('2026-04-01') })
  ;(computeSalesInPeriod as jest.Mock).mockResolvedValue(0)
  mockPrisma.staffPerformanceDocument.findMany.mockResolvedValue([])
  mockPrisma.staffPerformanceDocument.count.mockResolvedValue(0)
  mockPrisma.staffPerformanceDocument.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'doc1', ...data }),
  )
})

const VALID_BODY = {
  warningType: 'FIRST_WRITTEN_WARNING',
  requiredImprovement: 'Generate 2 sales per month.',
  pipDurationDays: 30,
  reviewDate: '2026-09-29',
}

describe('POST /api/admin/performance/cases/[caseId]/documents', () => {
  it('401/403 gates non-super-admin callers', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await POST(postReq(VALID_BODY), ctx)).status).toBe(401)
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'm', staffRole: 'sales_rep' })
    expect((await POST(postReq(VALID_BODY), ctx)).status).toBe(403)
  })

  it('404s an unknown case', async () => {
    mockPrisma.staffPerformanceCase.findUnique.mockResolvedValue(null)
    expect((await POST(postReq(VALID_BODY), ctx)).status).toBe(404)
  })

  it('rejects a missing/invalid warningType', async () => {
    const res = await POST(postReq({ ...VALID_BODY, warningType: 'TERMINATION' }), ctx)
    expect(res.status).toBe(400)
    expect(mockPrisma.staffPerformanceDocument.create).not.toHaveBeenCalled()
  })

  it('rejects a missing requiredImprovement (never generates a warning with no stated expectation)', async () => {
    const res = await POST(postReq({ ...VALID_BODY, requiredImprovement: '  ' }), ctx)
    expect(res.status).toBe(400)
  })

  it('creates the document as DRAFT, with facts pre-populated from authoritative records', async () => {
    const res = await POST(postReq(VALID_BODY), ctx)
    expect(res.status).toBe(201)
    const data = mockPrisma.staffPerformanceDocument.create.mock.calls[0][0].data
    expect(data.status).toBe('DRAFT')
    expect(data.employeeNameSnapshot).toBe('Jane Doe')
    expect(data.jobTitleSnapshot).toBe('Senior Sales Agent')
    expect(data.salesInPeriod).toBe(0)
    expect(data.reviewPeriodStart).toBe(CASE.reviewPeriodStart)
    expect(data.reviewPeriodEnd).toBe(CASE.reviewPeriodEnd)
  })

  it('never sets deliveredAt/issuedContent on generation — nothing is ever sent at draft time', async () => {
    await POST(postReq(VALID_BODY), ctx)
    const data = mockPrisma.staffPerformanceDocument.create.mock.calls[0][0].data
    expect(data.deliveredAt).toBeUndefined()
    expect(data.issuedContent).toBeUndefined()
  })

  it('summarizes prior formal warnings into warningHistorySummary when they exist', async () => {
    mockPrisma.staffPerformanceDocument.findMany.mockResolvedValue([
      { warningType: 'FIRST_WRITTEN_WARNING', createdAt: new Date('2026-01-01') },
    ])
    await POST(postReq(VALID_BODY), ctx)
    const data = mockPrisma.staffPerformanceDocument.create.mock.calls[0][0].data
    expect(data.warningHistorySummary).toMatch(/not the first performance action/i)
  })

  it('states no prior warning when none exist', async () => {
    await POST(postReq(VALID_BODY), ctx)
    const data = mockPrisma.staffPerformanceDocument.create.mock.calls[0][0].data
    expect(data.warningHistorySummary).toMatch(/No prior formal performance warning/i)
  })
})
