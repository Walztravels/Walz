/**
 * PATCH /api/admin/check-ins/[id] — waive / apply / dispute / resolve.
 * Covers:
 *   11 Waive -> attendance remains MISSED, the deduction becomes WAIVED
 *   17 Unauthorized staff cannot waive
 */
const mockPrisma = {
  checkInRecord: { findUnique: jest.fn(), update: jest.fn() },
  checkInDeduction: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  checkInDeductionPolicy: { findUnique: jest.fn() },
  staff: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { PATCH } from '@/app/api/admin/check-ins/[id]/route'

function patchReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Request
}
function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

const SUPER_ADMIN = { id: 'a1', staffId: 'admin1', role: 'super_admin', staffRole: 'super_admin' }
const SALES_REP   = { id: 'u2', staffId: 'staff2', role: 'sales_rep', staffRole: 'sales_rep' }

const MISSED_RECORD = { id: 'rec1', staffId: 'staff1', status: 'MISSED', windowStart: new Date('2026-10-05T10:00:00Z'), waived: false }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.checkInRecord.findUnique.mockResolvedValue(MISSED_RECORD)
  mockPrisma.checkInRecord.update.mockImplementation(async ({ data }: any) => ({ ...MISSED_RECORD, ...data }))
})

describe('PATCH /api/admin/check-ins/[id] — waive', () => {
  it('401s unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await PATCH(patchReq({ action: 'waive', reason: 'Approved leave' }), params('rec1'))
    expect(res.status).toBe(401)
  })

  it('test 17 — a non-super-admin (sales rep) cannot waive', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SALES_REP)
    const res = await PATCH(patchReq({ action: 'waive', reason: 'Approved leave' }), params('rec1'))
    expect(res.status).toBe(403)
    expect(mockPrisma.checkInDeduction.update).not.toHaveBeenCalled()
  })

  it('rejects a waive with no reason', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    const res = await PATCH(patchReq({ action: 'waive' }), params('rec1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.checkInRecord.update).not.toHaveBeenCalled()
  })

  it('test 11 — a valid waive sets the deduction to WAIVED but the record STAYS MISSED', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue({ id: 'ded1', status: 'ACTIVE', amount: 50, currency: 'NGN' })
    mockPrisma.checkInDeduction.update.mockResolvedValue({ id: 'ded1', status: 'WAIVED' })

    const res  = await PATCH(patchReq({ action: 'waive', reason: 'Approved leave' }), params('rec1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    // The deduction ledger row is what actually gets waived
    expect(mockPrisma.checkInDeduction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ded1' },
      data: expect.objectContaining({ status: 'WAIVED', waivedBy: 'admin1', waiverReason: 'Approved leave' }),
    }))
    // The original missed attendance record is NEVER deleted or rewritten to CHECKED_IN
    expect(mockPrisma.checkInRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rec1' },
      data: expect.not.objectContaining({ status: 'CHECKED_IN' }),
    }))
    expect(body.record.status).not.toBe('CHECKED_IN')
  })

  it('found by financial review: blocks waiving a deduction already applied to a generated payslip (409), never silently touches it', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue({
      id: 'ded1', status: 'ACTIVE', amount: 50, currency: 'NGN', appliedToPayslipId: 'payslip1',
    })
    const res  = await PATCH(patchReq({ action: 'waive', reason: 'Approved leave' }), params('rec1'))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toContain('payslip1')
    expect(mockPrisma.checkInDeduction.update).not.toHaveBeenCalled()
    expect(mockPrisma.checkInRecord.update).not.toHaveBeenCalled()
  })

  it('the same guard applies to approving a dispute (resolve action) — blocked once applied to a payslip', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue({
      id: 'ded1', status: 'ACTIVE', amount: 50, currency: 'NGN', appliedToPayslipId: 'payslip1',
    })
    const res = await PATCH(patchReq({ action: 'resolve', approved: true, reason: 'Dispute upheld' }), params('rec1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.checkInDeduction.update).not.toHaveBeenCalled()
  })

  it('is a no-op on the ledger if no deduction ever existed (e.g. policy was unconfigured) but still marks the legacy waived flag', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue(null)
    const res = await PATCH(patchReq({ action: 'waive', reason: 'Technical issue' }), params('rec1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.checkInDeduction.update).not.toHaveBeenCalled()
    expect(mockPrisma.checkInRecord.update).toHaveBeenCalled()
  })

  it('404s an unknown record', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInRecord.findUnique.mockResolvedValue(null)
    const res = await PATCH(patchReq({ action: 'waive', reason: 'x' }), params('nope'))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/check-ins/[id] — apply (Super Admin one-off)', () => {
  it('test 17 — a non-super-admin cannot apply a deduction', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SALES_REP)
    const res = await PATCH(patchReq({ action: 'apply' }), params('rec1'))
    expect(res.status).toBe(403)
  })

  it('400s when the country policy has no configured amount (never guesses)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue(null)
    mockPrisma.staff.findUnique.mockResolvedValue({ timezone: 'Africa/Accra' })
    mockPrisma.checkInDeductionPolicy.findUnique.mockResolvedValue({ country: 'GH', currency: 'GHS', amount: null, enabled: true })

    const res = await PATCH(patchReq({ action: 'apply' }), params('rec1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('409s when a deduction already exists (never double-creates)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
    mockPrisma.checkInDeduction.findUnique.mockResolvedValue({ id: 'ded1' })
    const res = await PATCH(patchReq({ action: 'apply' }), params('rec1'))
    expect(res.status).toBe(409)
  })
})
