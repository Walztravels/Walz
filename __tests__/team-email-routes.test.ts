/**
 * Walz Team Hub V1.1 — the two new HTTP surfaces:
 *   GET  /api/cron/team-email-notifications  (Bearer CRON_SECRET, fail-closed)
 *   GET/PATCH /api/admin/team/email-preferences (session-scoped to SELF only)
 */

const mockProcess = jest.fn()
jest.mock('@/lib/team/email-processor', () => ({ __esModule: true, processTeamEmailNotifications: () => mockProcess() }))

const mockPrisma = {
  teamEmailNotificationPreference: { findUnique: jest.fn(), upsert: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
}))

import { NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { GET as cronGet } from '@/app/api/cron/team-email-notifications/route'
import { GET as prefsGet, PATCH as prefsPatch } from '@/app/api/admin/team/email-preferences/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const ORIGINAL_SECRET = process.env.CRON_SECRET

function cronReq(auth?: string): NextRequest {
  return new NextRequest('https://walztravels.com/api/cron/team-email-notifications', {
    headers: auth ? { authorization: auth } : {},
  })
}
function patchReq(body: unknown): NextRequest {
  return new NextRequest('https://walztravels.com/api/admin/team/email-preferences', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockProcess.mockResolvedValue({ scanned: 0, emailsSent: 0 })
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  jest.restoreAllMocks()
  process.env.CRON_SECRET = ORIGINAL_SECRET
})

describe('cron route', () => {
  it('rejects a request with no/!wrong bearer token and never runs the processor', async () => {
    process.env.CRON_SECRET = 'shhh'
    expect((await cronGet(cronReq())).status).toBe(401)
    expect((await cronGet(cronReq('Bearer nope'))).status).toBe(401)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('fails closed when CRON_SECRET is not configured at all', async () => {
    delete process.env.CRON_SECRET
    expect((await cronGet(cronReq('Bearer '))).status).toBe(401)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it('runs the processor and returns its summary for a valid cron call', async () => {
    process.env.CRON_SECRET = 'shhh'
    mockProcess.mockResolvedValue({ scanned: 3, emailsSent: 1, candidatesSent: 3 })
    const res = await cronGet(cronReq('Bearer shhh'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, scanned: 3, emailsSent: 1 })
  })

  it('returns a generic 500 (no internals) when a tick throws', async () => {
    process.env.CRON_SECRET = 'shhh'
    mockProcess.mockRejectedValue(new Error('postgres connection string leaked here'))
    const res = await cronGet(cronReq('Bearer shhh'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('postgres')
  })
})

describe('preferences route', () => {
  it('requires a session', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await prefsGet()).status).toBe(401)
    expect((await prefsPatch(patchReq({ invites: false }))).status).toBe(401)
    expect(mockPrisma.teamEmailNotificationPreference.upsert).not.toHaveBeenCalled()
  })

  it('returns the all-on defaults when the staff member has no row (no row is ever created on read)', async () => {
    mockPrisma.teamEmailNotificationPreference.findUnique.mockResolvedValue(null)
    const res = await prefsGet()
    await expect(res.json()).resolves.toEqual({
      preferences: { directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true },
    })
    expect(mockPrisma.teamEmailNotificationPreference.upsert).not.toHaveBeenCalled()
  })

  it('reads and writes the SESSION staff id only — a staffId in the body is ignored', async () => {
    mockPrisma.teamEmailNotificationPreference.upsert.mockResolvedValue({
      directMessages: true, mentionsAndThreads: true, missedCalls: false, invites: true,
    })
    await prefsPatch(patchReq({ missedCalls: false, staffId: 'someone-else' }))
    const args = mockPrisma.teamEmailNotificationPreference.upsert.mock.calls[0][0]
    expect(args.where).toEqual({ staffId: 's1' })
    expect(args.update).toEqual({ missedCalls: false })
    expect(args.create).toMatchObject({ staffId: 's1', missedCalls: false, invites: true })
    expect(JSON.stringify(args)).not.toContain('someone-else')
  })

  it('rejects a body with no valid boolean values', async () => {
    const res = await prefsPatch(patchReq({ missedCalls: 'false', nonsense: 1 }))
    expect(res.status).toBe(400)
    expect(mockPrisma.teamEmailNotificationPreference.upsert).not.toHaveBeenCalled()
  })
})
