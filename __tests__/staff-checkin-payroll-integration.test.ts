/**
 * Check-In V2 -> Payroll bridge.
 * Covers:
 *   12 A waived deduction no longer reduces net payable
 *   16 The deduction is applied exactly once in the payroll calculation
 */
const mockPrisma = {
  staffMember: { findUnique: jest.fn() },
  staff: { findUnique: jest.fn() },
  payslip: { upsert: jest.fn() },
  checkInDeduction: { findMany: jest.fn(), updateMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'

function jsonReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'a1', staffId: 'admin1', role: 'super_admin' })
})

describe('GET /api/admin/payroll/check-in-deductions', () => {
  it('test 12 — a WAIVED deduction is excluded from the real, unclaimed total (never reduces net payable)', async () => {
    const { GET } = await import('@/app/api/admin/payroll/check-in-deductions/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ email: 'jane@walztravels.com', currency: 'NGN' })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    // Only the ACTIVE row should be summed — the WAIVED one is filtered out
    // at the query layer (status: 'ACTIVE' in the where clause), so the mock
    // simulates exactly what that query would return.
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([
      { amount: 50, currency: 'NGN' },
    ])

    const req = new Request('https://x/api/admin/payroll/check-in-deductions?staffMemberId=sm1&month=10&year=2026')
    const body = await (await GET(req)).json()

    expect(mockPrisma.checkInDeduction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'ACTIVE' }),
    }))
    expect(body.amount).toBe(50)
    expect(body.count).toBe(1)
  })

  it('returns zero when the payroll StaffMember has no matching check-in Staff record', async () => {
    const { GET } = await import('@/app/api/admin/payroll/check-in-deductions/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ email: 'unmatched@walztravels.com', currency: 'NGN' })
    mockPrisma.staff.findUnique.mockResolvedValue(null)

    const req = new Request('https://x/api/admin/payroll/check-in-deductions?staffMemberId=sm1&month=10&year=2026')
    const body = await (await GET(req)).json()
    expect(body.unmatched).toBe(true)
    expect(body.amount).toBe(0)
  })
})

describe('POST /api/admin/payroll/generate — deduction applied exactly once', () => {
  it('test 16 — generating a payslip stamps the ledger rows so they cannot be reused in a later run', async () => {
    const { POST } = await import('@/app/api/admin/payroll/generate/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ id: 'sm1', email: 'jane@walztravels.com', baseSalary: 100000, currency: 'NGN' })
    mockPrisma.payslip.upsert.mockResolvedValue({ id: 'payslip1', netPay: 99950 })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 1 })

    const body = await (await POST(jsonReq({
      staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 50,
    }))).json()

    expect(body.payslip.id).toBe('payslip1')
    expect(mockPrisma.checkInDeduction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ staffId: 'staff1', status: 'ACTIVE', effectivePayrollPeriod: '2026-10', appliedToPayslipId: null }),
      data:  expect.objectContaining({ appliedToPayslipId: 'payslip1' }),
    }))
  })

  it('a second generate call for the same period finds nothing left to stamp (idempotent — no double count)', async () => {
    const { POST } = await import('@/app/api/admin/payroll/generate/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ id: 'sm1', email: 'jane@walztravels.com', baseSalary: 100000, currency: 'NGN' })
    mockPrisma.payslip.upsert.mockResolvedValue({ id: 'payslip1' })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    // Simulate: first call already stamped everything -> updateMany affects 0 rows now
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 0 })

    await POST(jsonReq({ staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 50 }))
    const secondCallArgs = mockPrisma.checkInDeduction.updateMany.mock.calls[0][0]
    expect(secondCallArgs.where.appliedToPayslipId).toBeNull() // only ever touches still-unclaimed rows
  })
})
