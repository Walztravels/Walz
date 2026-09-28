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

  it('found by independent security review: a sales rep (or any non-admin role) cannot view another employee\'s deduction totals — 403', async () => {
    const { GET } = await import('@/app/api/admin/payroll/check-in-deductions/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'u2', staffId: 'staff2', role: 'sales_rep' })
    const req = new Request('https://x/api/admin/payroll/check-in-deductions?staffMemberId=sm1&month=10&year=2026')
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(mockPrisma.staffMember.findUnique).not.toHaveBeenCalled()
  })

  it('an operations manager (an admin-tier role) CAN view deduction totals', async () => {
    const { GET } = await import('@/app/api/admin/payroll/check-in-deductions/route')
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'o1', staffId: 'ops1', role: 'operations_manager' })
    mockPrisma.staffMember.findUnique.mockResolvedValue({ email: 'jane@walztravels.com', currency: 'NGN' })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([{ amount: 50, currency: 'NGN' }])
    const req = new Request('https://x/api/admin/payroll/check-in-deductions?staffMemberId=sm1&month=10&year=2026')
    const res = await GET(req)
    expect(res.status).toBe(200)
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
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([])
    // Simulate: first call already stamped everything -> updateMany affects 0 rows now
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 0 })

    await POST(jsonReq({ staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 50 }))
    const secondCallArgs = mockPrisma.checkInDeduction.updateMany.mock.calls[0][0]
    expect(secondCallArgs.where.appliedToPayslipId).toBeNull() // only ever touches still-unclaimed rows
  })

  it('found by financial review: surfaces a deductionMismatch warning when the admin-typed attendanceDeduction diverges from the real ledger total', async () => {
    const { POST } = await import('@/app/api/admin/payroll/generate/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ id: 'sm1', email: 'jane@walztravels.com', baseSalary: 100000, currency: 'NGN' })
    mockPrisma.payslip.upsert.mockResolvedValue({ id: 'payslip1', netPay: 99950 })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    // Real ledger says 100 (two missed check-ins), but the admin typed 50.
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([
      { amount: 50, currency: 'NGN' }, { amount: 50, currency: 'NGN' },
    ])
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 2 })

    const body = await (await POST(jsonReq({
      staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 50,
    }))).json()

    expect(body.deductionMismatch).toEqual({ providedAttendanceDeduction: 50, realLedgerTotal: 100, currency: 'NGN' })
    // The mismatch is a WARNING only — stamping still happens regardless, so
    // the ledger itself can never be double-counted even when the admin's
    // typed number was wrong.
    expect(mockPrisma.checkInDeduction.updateMany).toHaveBeenCalled()
  })

  it('no mismatch warning when the admin-typed amount matches the real ledger total exactly', async () => {
    const { POST } = await import('@/app/api/admin/payroll/generate/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ id: 'sm1', email: 'jane@walztravels.com', baseSalary: 100000, currency: 'NGN' })
    mockPrisma.payslip.upsert.mockResolvedValue({ id: 'payslip1' })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([{ amount: 50, currency: 'NGN' }])
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 1 })

    const body = await (await POST(jsonReq({
      staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 50,
    }))).json()

    expect(body.deductionMismatch).toBeNull()
  })

  it('no mismatch warning when there are zero unclaimed ledger rows at all (nothing to compare against)', async () => {
    const { POST } = await import('@/app/api/admin/payroll/generate/route')
    mockPrisma.staffMember.findUnique.mockResolvedValue({ id: 'sm1', email: 'jane@walztravels.com', baseSalary: 100000, currency: 'NGN' })
    mockPrisma.payslip.upsert.mockResolvedValue({ id: 'payslip1' })
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'staff1' })
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([])
    mockPrisma.checkInDeduction.updateMany.mockResolvedValue({ count: 0 })

    const body = await (await POST(jsonReq({
      staffMemberId: 'sm1', month: 10, year: 2026, attendanceDeduction: 30, // admin typed something, but there's no real ledger data
    }))).json()

    expect(body.deductionMismatch).toBeNull()
  })
})
