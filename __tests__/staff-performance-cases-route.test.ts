/**
 * POST /api/admin/performance/cases — opening a performance review case.
 * NO WARNING IS EVER GENERATED OR SENT AUTOMATICALLY — a managementAction
 * is always required from the request body (i.e. an explicit human
 * choice); there is no code path that defaults or infers one.
 */
const mockPrisma = {
  staff: { findUnique: jest.fn() },
  staffPerformanceCase: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/sales', () => ({ computeStaffSalesSummary: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { computeStaffSalesSummary } from '@/lib/performance/sales'
import { logPerformanceHistory } from '@/lib/performance/history'
import { POST } from '@/app/api/admin/performance/cases/route'

const SUPER_ADMIN = { id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' }

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staff.findUnique.mockResolvedValue({ id: 's2', name: 'Jane Doe' })
  ;(computeStaffSalesSummary as jest.Mock).mockResolvedValue({
    daysSinceLastSale: 130,
    lastCompletedSaleAt: new Date('2026-05-01'),
    salesLast120: 0,
  })
  mockPrisma.staffPerformanceCase.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'case1', ...data }),
  )
})

const VALID_BODY = {
  staffId: 's2',
  managementAction: 'MONITOR',
  reviewPeriodStart: '2026-05-01',
  reviewPeriodEnd: '2026-08-29',
  notes: 'note',
  mitigatingCircumstances: '',
  nextReviewDate: '2026-10-29',
}

describe('POST /api/admin/performance/cases', () => {
  it('401s unauthenticated, 403s non-super-admin', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await POST(postReq(VALID_BODY))).status).toBe(401)

    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'm1', staffRole: 'senior_manager' })
    expect((await POST(postReq(VALID_BODY))).status).toBe(403)
    expect(mockPrisma.staffPerformanceCase.create).not.toHaveBeenCalled()
  })

  it('rejects a request with no managementAction (never defaults to a disciplinary action)', async () => {
    const res = await POST(postReq({ ...VALID_BODY, managementAction: undefined }))
    expect(res.status).toBe(400)
    expect(mockPrisma.staffPerformanceCase.create).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized managementAction value', async () => {
    const res = await POST(postReq({ ...VALID_BODY, managementAction: 'TERMINATE' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.staffPerformanceCase.create).not.toHaveBeenCalled()
  })

  it('404s an unknown staffId (never silently creates a case for a nonexistent staff member)', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue(null)
    const res = await POST(postReq(VALID_BODY))
    expect(res.status).toBe(404)
    expect(mockPrisma.staffPerformanceCase.create).not.toHaveBeenCalled()
  })

  it('NO_ACTION closes the case immediately with closureOutcome NO_ACTION', async () => {
    const res = await POST(postReq({ ...VALID_BODY, managementAction: 'NO_ACTION' }))
    expect(res.status).toBe(201)
    const call = mockPrisma.staffPerformanceCase.create.mock.calls[0][0].data
    expect(call.status).toBe('CLOSED')
    expect(call.closureOutcome).toBe('NO_ACTION')
    expect(call.closedAt).toBeInstanceOf(Date)
  })

  it('MONITOR opens a MONITORING case, not closed', async () => {
    const res = await POST(postReq({ ...VALID_BODY, managementAction: 'MONITOR' }))
    expect(res.status).toBe(201)
    const call = mockPrisma.staffPerformanceCase.create.mock.calls[0][0].data
    expect(call.status).toBe('MONITORING')
    expect(call.closedAt).toBeNull()
  })

  it('FIRST_WARNING_ISSUED / FINAL_WARNING_ISSUED open the case as OPEN (the document is generated separately, never automatically)', async () => {
    const res = await POST(postReq({ ...VALID_BODY, managementAction: 'FIRST_WARNING_ISSUED' }))
    const call = mockPrisma.staffPerformanceCase.create.mock.calls[0][0].data
    expect(call.status).toBe('OPEN')
    expect(res.status).toBe(201)
  })

  it('snapshots the sales evidence AT THE TIME the case was opened (immutable historical basis)', async () => {
    await POST(postReq(VALID_BODY))
    const call = mockPrisma.staffPerformanceCase.create.mock.calls[0][0].data
    expect(call.daysSinceLastSaleAtOpen).toBe(130)
    expect(call.salesInPeriodAtOpen).toBe(0)
  })

  it('records an immutable history entry naming the actor and the chosen action', async () => {
    await POST(postReq(VALID_BODY))
    expect(logPerformanceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASE_OPENED', actorStaffId: 'admin1', actorName: 'Super Admin' }),
    )
  })
})
