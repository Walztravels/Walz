/**
 * GET /api/admin/check-ins/live — the admin dashboard feed.
 * Covers:
 *   10 NGN + GHS dashboard -> separate currency totals, never summed
 *   15 An online staff member who missed their check-in shows BOTH
 *      online:true and a MISSED current-check-in status simultaneously
 */
const mockPrisma = {
  checkInSettings: { findUnique: jest.fn() },
  staff: { findMany: jest.fn() },
  checkInRecord: { findMany: jest.fn() },
  checkInDeduction: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { GET } from '@/app/api/admin/check-ins/live/route'

const SETTINGS = {
  workStartHour: 8, workEndHour: 17,
  satEnabled: false, satStartHour: 9, satEndHour: 14, sunEnabled: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-10-05T10:00:00Z')) // 11:00 Lagos / 10:00 Accra
  ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'a1', staffId: 'admin1', role: 'super_admin', staffRole: 'super_admin' })
  mockPrisma.checkInSettings.findUnique.mockResolvedValue(SETTINGS)
})

afterEach(() => jest.useRealTimers())

describe('GET /api/admin/check-ins/live', () => {
  it('403s a role outside the admin allowlist', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', role: 'sales_rep' })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('test 15 — an online staff member with a MISSED current window shows both simultaneously', async () => {
    jest.setSystemTime(new Date('2026-10-05T09:59:00Z')) // 10:59 Lagos — the 10:00 Lagos window is still "current"
    const now = new Date('2026-10-05T09:59:00Z')
    mockPrisma.staff.findMany.mockResolvedValue([{
      id: 'staff1', name: 'Priscilla', role: 'sales_rep', roleTitle: 'Sales',
      timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14,
      lastActiveAt: new Date(now.getTime() - 60_000), // active 1 minute ago -> online
    }])
    // The current 10:00 Lagos window (09:00-10:00 UTC) is already confirmed MISSED
    mockPrisma.checkInRecord.findMany.mockResolvedValue([
      { id: 'rec1', staffId: 'staff1', windowStart: new Date('2026-10-05T09:00:00Z'), status: 'MISSED', manualCheckin: false, actualCheckInAt: null, waived: false, disputeStatus: null },
    ])
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([])

    const res  = await GET()
    const body = await res.json()
    const row  = body.staffStatus[0]

    expect(row.online).toBe(true)                       // ONLINE STATUS
    expect(row.missedToday).toBe(1)                      // CHECK-IN STATUS — independent
    expect(row.currentCheckIn.status).toBe('MISSED')     // both are true at once — neither overrides the other
  })

  it('test 10 — NGN and GHS deduction totals are reported separately, never numerically combined', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([
      { id: 's_ng', name: 'Nigeria Staff', role: 'sales_rep', roleTitle: 'Sales', timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14, lastActiveAt: null },
      { id: 's_gh', name: 'Ghana Staff',   role: 'sales_rep', roleTitle: 'Sales', timezone: 'Africa/Accra', breakStartHour: 12, breakEndHour: 13, lastActiveAt: null },
    ])
    mockPrisma.checkInRecord.findMany.mockResolvedValue([])
    mockPrisma.checkInDeduction.findMany.mockResolvedValue([
      { staffId: 's_ng', amount: 150, currency: 'NGN' },
      { staffId: 's_gh', amount: 20,  currency: 'GHS' },
    ])

    const body = await (await GET()).json()

    expect(body.stats.weekDeductionsByCurrency).toEqual({ NGN: 150, GHS: 20 })
    // Never a single combined numeric total across currencies
    expect(body.stats.weekDeductionsByCurrency).not.toHaveProperty('total')
    expect(Object.values(body.stats.weekDeductionsByCurrency) as number[]).not.toContain(170)

    const ngRow = body.staffStatus.find((s: any) => s.id === 's_ng')
    const ghRow = body.staffStatus.find((s: any) => s.id === 's_gh')
    expect(ngRow.weekDeductionsByCurrency).toEqual({ NGN: 150 })
    expect(ghRow.weekDeductionsByCurrency).toEqual({ GHS: 20 })
  })
})
