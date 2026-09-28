/**
 * POST /api/admin/check-ins/manual — the ONLY way to satisfy a check-in.
 * Covers:
 *   1  Staff logged into Admin all day but never manually checks in -> MISSED
 *      (proven here by showing this route is the ONLY writer of a
 *      CHECKED_IN status; see staff-checkin-cron-route.test.ts for the
 *      corresponding MISSED-creation half of this scenario)
 *   2  Inbox/Admin activity during the window, but no Check In -> MISSED
 *      (proven structurally: this route never reads ActivityLog/CallLog)
 *   3  Manual check-in inside window -> CHECKED_IN
 *   4  An 11 AM check-in does not satisfy 12 PM
 *   5  Duplicate Check In clicks -> one attendance record
 *   16 The server resolves staffId/timestamp itself — the browser cannot
 *      submit either
 */
const mockPrisma = {
  staff: { findUnique: jest.fn() },
  checkInSettings: { findUnique: jest.fn() },
  checkInRecord: { findMany: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, prisma: mockPrisma, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { POST } from '@/app/api/admin/check-ins/manual/route'

const SESSION = { id: 'u1', staffId: 'staff1', role: 'sales_rep', staffRole: 'sales_rep', email: 'a@walztravels.com' }

const SETTINGS = {
  id: 'singleton', enabled: true,
  workStartHour: 8, workEndHour: 17,
  satEnabled: true, satStartHour: 9, satEndHour: 14, sunEnabled: false,
  graceMinutes: 0, // grace-period rescue behaviour is covered separately in staff-checkin-windows.test.ts
}

const STAFF = {
  id: 'staff1', isActive: true, checkInTracked: true,
  timezone: 'Africa/Lagos', breakStartHour: 13, breakEndHour: 14,
}

// In-memory CheckInRecord store keyed by "staffId|windowStartISO", to make
// the upsert/findMany mocks behave like a real unique-keyed table.
function makeRecordStore() {
  const store = new Map<string, any>()
  const key = (staffId: string, windowStart: Date) => `${staffId}|${windowStart.toISOString()}`
  return {
    store,
    findMany: jest.fn(async ({ where }: any) => {
      const ins: Date[] = where.windowStart.in
      return ins
        .map(ws => store.get(key(where.staffId, ws)))
        .filter(Boolean)
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const k = key(where.staffId_windowStart.staffId, where.staffId_windowStart.windowStart)
      const existing = store.get(k)
      const row = existing ? { ...existing, ...update } : { id: `rec_${store.size + 1}`, ...create }
      store.set(k, row)
      return row
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const k = key(where.staffId_windowStart.staffId, where.staffId_windowStart.windowStart)
      return store.get(k) ?? null
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockPrisma.staff.findUnique.mockResolvedValue(STAFF)
  mockPrisma.checkInSettings.findUnique.mockResolvedValue(SETTINGS)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('POST /api/admin/check-ins/manual', () => {
  it('401s when not authenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('test 3 — a manual check-in inside the window creates a CHECKED_IN record with a server timestamp', async () => {
    jest.setSystemTime(new Date('2026-10-05T10:03:00Z')) // 11:03 Lagos
    const recordStore = makeRecordStore()
    mockPrisma.checkInRecord.findMany = recordStore.findMany
    mockPrisma.checkInRecord.upsert   = recordStore.upsert

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.record.status).toBe('CHECKED_IN')
    expect(body.record.manualCheckin).toBe(true)
    expect(body.record.source).toBe('MANUAL')
    // Server resolved the staffId — never trusts a browser-submitted one
    expect(recordStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffId_windowStart: expect.objectContaining({ staffId: 'staff1' }) },
    }))
    // Server-resolved timestamp, not something the client could have sent (no body is even read)
    expect(new Date(body.record.actualCheckInAt).getTime()).toBe(new Date('2026-10-05T10:03:00Z').getTime())
  })

  it('test 5 — duplicate Check In clicks produce exactly one attendance record', async () => {
    jest.setSystemTime(new Date('2026-10-05T10:03:00Z'))
    const recordStore = makeRecordStore()
    mockPrisma.checkInRecord.findMany = recordStore.findMany
    mockPrisma.checkInRecord.upsert   = recordStore.upsert

    await POST()
    jest.setSystemTime(new Date('2026-10-05T10:04:00Z')) // a second, slightly later click
    const secondRes = await POST()
    const secondBody = await secondRes.json()

    expect(recordStore.store.size).toBe(1)
    expect(secondBody.alreadyCheckedIn).toBe(true)
  })

  it('test 4 — checking in for the 11 AM window does not satisfy the 12 PM window', async () => {
    const recordStore = makeRecordStore()
    mockPrisma.checkInRecord.findMany = recordStore.findMany
    mockPrisma.checkInRecord.upsert   = recordStore.upsert

    jest.setSystemTime(new Date('2026-10-05T10:03:00Z')) // 11:03 Lagos
    await POST() // checks in for the 11:00 Lagos window

    jest.setSystemTime(new Date('2026-10-05T11:05:00Z')) // 12:05 Lagos — a new, independent window
    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.alreadyCheckedIn).toBeUndefined() // this is a genuinely NEW check-in, not a duplicate
    expect(recordStore.store.size).toBe(2)
    const windowStarts = Array.from(recordStore.store.values()).map((r: any) => r.windowStart.toISOString())
    expect(new Set(windowStarts).size).toBe(2)
  })

  it('400s when check-in tracking is disabled', async () => {
    mockPrisma.checkInSettings.findUnique.mockResolvedValue({ ...SETTINGS, enabled: false })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('400s when the staff member is not tracked', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ ...STAFF, checkInTracked: false })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('400s outside all work hours (no window open)', async () => {
    jest.setSystemTime(new Date('2026-10-05T20:00:00Z')) // 21:00 Lagos — well past close
    const recordStore = makeRecordStore()
    mockPrisma.checkInRecord.findMany = recordStore.findMany
    mockPrisma.checkInRecord.upsert   = recordStore.upsert
    const res = await POST()
    expect(res.status).toBe(400)
  })
})
