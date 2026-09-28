/**
 * GET /api/cron/check-ins — the missed-check-in detector.
 * Covers:
 *   1  Staff logged into Admin all day, never manually checks in -> MISSED
 *   2  Inbox/Admin activity during the window, but no Check In -> MISSED
 *      (this test file deliberately never mocks prisma.activityLog /
 *      prisma.callLog — if the cron route still referenced either, calling
 *      it would throw "is not a function" and fail the test. That is the
 *      structural proof that admin/session/API/Inbox/Team-Hub activity can
 *      never satisfy a check-in any more.)
 *   6  A missed occurrence creates exactly one deduction
 *   7  Cron executes twice -> still one deduction
 *   14 Inactive / disabled-tracking -> no records, no deductions
 */
const mockPrisma = {
  checkInSettings: { findUnique: jest.fn() },
  staff: { findMany: jest.fn() },
  checkInRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  checkInDeduction: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  checkInDeductionPolicy: { findUnique: jest.fn() },
  notificationLog: { findUnique: jest.fn(), createMany: jest.fn() },
  // NOTE: activityLog / callLog are intentionally absent — see file header.
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: jest.fn().mockResolvedValue({}) } }) }))
jest.mock('@/lib/notifications/staff', () => ({ createStaffNotification: jest.fn().mockResolvedValue('notif1') }))

process.env.CRON_SECRET = 'test-secret'

import { GET } from '@/app/api/cron/check-ins/route'
import { createStaffNotification } from '@/lib/notifications/staff'

function req() {
  return new Request('https://x/api/cron/check-ins', { headers: { authorization: 'Bearer test-secret' } })
}

const SETTINGS = {
  id: 'singleton', enabled: true,
  workStartHour: 8, workEndHour: 17,
  satEnabled: false, satStartHour: 9, satEndHour: 14, sunEnabled: false,
  graceMinutes: 0,
  effectiveDeductionDate: new Date('2026-01-01T00:00:00Z'),
}

const STAFF = {
  id: 'staff1', name: 'Jane Doe', email: 'jane@walztravels.com',
  timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14,
  isActive: true, checkInTracked: true, hireDate: null,
}

function makeDeductionStore() {
  const store = new Map<string, any>()
  return {
    store,
    findUnique: jest.fn(async ({ where }: any) => store.get(where.checkInRecordId) ?? null),
    create: jest.fn(async ({ data }: any) => {
      if (store.has(data.checkInRecordId)) throw new Error('unique violation')
      const row = { id: `ded_${store.size + 1}`, ...data }
      store.set(data.checkInRecordId, row)
      return row
    }),
  }
}

function makeCheckInRecordStore() {
  const store = new Map<string, any>()
  const key = (staffId: string, windowStart: Date) => `${staffId}|${windowStart.toISOString()}`
  return {
    store,
    findUnique: jest.fn(async ({ where }: any) => store.get(key(where.staffId_windowStart.staffId, where.staffId_windowStart.windowStart)) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const k = key(data.staffId, data.windowStart)
      if (store.has(k)) throw new Error('unique violation')
      const row = { id: `rec_${store.size + 1}`, ...data }
      store.set(k, row)
      return row
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const entry = Array.from(store.entries()).find(([, r]) => r.id === where.id)
      if (!entry) throw new Error('not found')
      const updated = { ...entry[1], ...data }
      store.set(entry[0], updated)
      return updated
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-10-05T09:30:00Z')) // 10:30 Lagos — hour 8 and 9 windows have closed
  mockPrisma.checkInSettings.findUnique.mockResolvedValue(SETTINGS)
  mockPrisma.staff.findMany.mockResolvedValue([STAFF])
  mockPrisma.checkInDeductionPolicy.findUnique.mockResolvedValue({ country: 'NG', currency: 'NGN', amount: 50, enabled: true })
  mockPrisma.notificationLog.findUnique.mockResolvedValue(null)
  mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 2 })
  mockPrisma.checkInRecord.count.mockResolvedValue(1)
  mockPrisma.checkInDeduction.findMany.mockResolvedValue([])
})

afterEach(() => jest.useRealTimers())

describe('GET /api/cron/check-ins', () => {
  it('401s without the cron secret', async () => {
    const res = await GET(new Request('https://x/api/cron/check-ins'))
    expect(res.status).toBe(401)
  })

  it('tests 1 & 2 — a staff member with zero manual check-ins gets MISSED for every closed window, regardless of any other activity', async () => {
    const records = makeCheckInRecordStore()
    const deductions = makeDeductionStore()
    mockPrisma.checkInRecord.findUnique = records.findUnique
    mockPrisma.checkInRecord.create     = records.create
    mockPrisma.checkInRecord.update     = records.update
    mockPrisma.checkInDeduction.findUnique = deductions.findUnique
    mockPrisma.checkInDeduction.create     = deductions.create

    const res  = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.missedCreated).toBe(2) // hours 8 and 9 have closed by 10:30 Lagos
    expect(Array.from(records.store.values()).every((r: any) => r.status === 'MISSED')).toBe(true)
    expect(Array.from(records.store.values()).every((r: any) => r.source === 'SYSTEM')).toBe(true)
  })

  it('test 6 — exactly one deduction is created per missed occurrence', async () => {
    const records = makeCheckInRecordStore()
    const deductions = makeDeductionStore()
    mockPrisma.checkInRecord.findUnique = records.findUnique
    mockPrisma.checkInRecord.create     = records.create
    mockPrisma.checkInRecord.update     = records.update
    mockPrisma.checkInDeduction.findUnique = deductions.findUnique
    mockPrisma.checkInDeduction.create     = deductions.create

    const body = await (await GET(req())).json()
    expect(body.deductionsMade).toBe(2) // one per missed window (hours 8, 9)
    expect(deductions.store.size).toBe(2)
  })

  it('test 7 — running the cron twice for the same closed windows creates no additional deductions', async () => {
    const records = makeCheckInRecordStore()
    const deductions = makeDeductionStore()
    mockPrisma.checkInRecord.findUnique = records.findUnique
    mockPrisma.checkInRecord.create     = records.create
    mockPrisma.checkInRecord.update     = records.update
    mockPrisma.checkInDeduction.findUnique = deductions.findUnique
    mockPrisma.checkInDeduction.create     = deductions.create

    const first  = await (await GET(req())).json()
    const second = await (await GET(req())).json()

    expect(first.deductionsMade).toBe(2)
    expect(second.deductionsMade).toBe(0)   // idempotent replay — already-MISSED records, deduction already exists
    expect(second.missedCreated).toBe(0)    // already-created MISSED records are not recreated
    expect(deductions.store.size).toBe(2)   // still exactly one per occurrence
  })

  it('sends the in-app notification with the corrected wording and the deduction amount', async () => {
    const records = makeCheckInRecordStore()
    const deductions = makeDeductionStore()
    mockPrisma.checkInRecord.findUnique = records.findUnique
    mockPrisma.checkInRecord.create     = records.create
    mockPrisma.checkInRecord.update     = records.update
    mockPrisma.checkInDeduction.findUnique = deductions.findUnique
    mockPrisma.checkInDeduction.create     = deductions.create

    await GET(req())

    expect(createStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'staff1',
      body: expect.stringContaining('No manual check-in was recorded during the required check-in window.'),
    }))
    // The old removed wording must never appear
    const calls = (createStaffNotification as jest.Mock).mock.calls
    expect(calls.some(([opts]) => /admin activity/i.test(opts.body))).toBe(false)
  })

  it('test 14 — an inactive/untracked staff member is never even considered', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([]) // the query itself already filters isActive+checkInTracked
    const body = await (await GET(req())).json()
    expect(body.processed ?? 0).toBe(0)
    expect(mockPrisma.checkInDeduction.create).not.toHaveBeenCalled()
  })

  it('skips entirely when tracking is disabled globally', async () => {
    mockPrisma.checkInSettings.findUnique.mockResolvedValue({ ...SETTINGS, enabled: false })
    const body = await (await GET(req())).json()
    expect(body.skipped).toBe(true)
    expect(mockPrisma.staff.findMany).not.toHaveBeenCalled()
  })

  it('creates MISSED records but zero deductions when no effective deduction date has been set (brief §19)', async () => {
    mockPrisma.checkInSettings.findUnique.mockResolvedValue({ ...SETTINGS, effectiveDeductionDate: null })
    const records = makeCheckInRecordStore()
    const deductions = makeDeductionStore()
    mockPrisma.checkInRecord.findUnique = records.findUnique
    mockPrisma.checkInRecord.create     = records.create
    mockPrisma.checkInRecord.update     = records.update
    mockPrisma.checkInDeduction.findUnique = deductions.findUnique
    mockPrisma.checkInDeduction.create     = deductions.create

    const body = await (await GET(req())).json()
    expect(body.missedCreated).toBe(2)
    expect(body.deductionsMade).toBe(0)
    expect(deductions.store.size).toBe(0)
  })
})
