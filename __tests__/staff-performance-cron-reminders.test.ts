/**
 * GET /api/cron/performance-review-reminders — cron-secret gated, notifies
 * Super Admins only (never the employee), 7 days before and on the review
 * date (mission brief §10). Never takes any management action itself.
 */
const mockPrisma = {
  staffPerformanceCase: { findMany: jest.fn() },
  staff: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/notifications/staff', () => ({ createStaffNotification: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

import { createStaffNotification } from '@/lib/notifications/staff'
import { GET } from '@/app/api/cron/performance-review-reminders/route'

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k] ?? null } } as unknown as Parameters<typeof GET>[0]
}

const OLD_ENV = process.env.CRON_SECRET

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  mockPrisma.staffPerformanceCase.findMany.mockResolvedValue([])
  mockPrisma.staff.findMany.mockResolvedValue([{ id: 'admin1' }])
})
afterAll(() => { process.env.CRON_SECRET = OLD_ENV })

describe('GET /api/cron/performance-review-reminders', () => {
  it('401s without the correct bearer secret', async () => {
    const res = await GET(req({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    expect(createStaffNotification).not.toHaveBeenCalled()
  })

  it('401s when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer anything' }))
    expect(res.status).toBe(401)
  })

  it('notifies only super_admin staff, never the reviewed employee', async () => {
    await GET(req({ authorization: 'Bearer test-secret' }))
    const calls = mockPrisma.staff.findMany.mock.calls
    const superAdminCall = calls.find((c) => c[0]?.where?.role === 'super_admin')
    expect(superAdminCall).toBeDefined()
    expect(superAdminCall![0].where).toMatchObject({ role: 'super_admin', isActive: true })
  })

  it('sends a reminder for a case due in exactly 7 days, addressed to each active super admin', async () => {
    const in7 = new Date(Date.now() + 7 * 86_400_000)
    mockPrisma.staffPerformanceCase.findMany
      .mockResolvedValueOnce([{ id: 'case1', staffId: 's2', nextReviewDate: in7 }])
      .mockResolvedValueOnce([])
    await GET(req({ authorization: 'Bearer test-secret' }))
    expect(createStaffNotification).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'admin1', category: 'MANAGEMENT', sourceId: 'performance-reminder:case1:7_days_before' }),
    )
  })

  it('never sends anything when there are no active super admins', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([])
    const res = await GET(req({ authorization: 'Bearer test-secret' }))
    const json = await res.json()
    expect(json.sent).toBe(0)
    expect(createStaffNotification).not.toHaveBeenCalled()
  })
})
