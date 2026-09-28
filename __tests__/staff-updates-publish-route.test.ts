/**
 * Staff Updates — PATCH /api/admin/announcements/[id] (the "Publish Now" route)
 *
 * Verifies it delegates the publish→notify fan-out to the shared
 * notifyAnnouncementPublished() orchestrator exactly once, only on the
 * DRAFT/APPROVED → PUBLISHED transition, and that a notify failure never
 * fails the PATCH response itself (the announcement's PUBLISHED status is
 * already committed by that point).
 */

const mockPrisma = {
  staffAnnouncement: { findUnique: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

const notifyAnnouncementPublished = jest.fn()
jest.mock('@/lib/staff-updates/notify', () => ({
  __esModule: true,
  notifyAnnouncementPublished: (...args: unknown[]) => notifyAnnouncementPublished(...args),
}))

import { NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { PATCH } from '@/app/api/admin/announcements/[id]/route'

const ADMIN_SESSION = { id: 'admin-1', role: 'super_admin', name: 'Super Admin', email: 'admin@walztravels.com' }

const DRAFT_ANN = {
  id: 'ann-1', status: 'DRAFT', title: 'T', summary: 'S', category: 'SYSTEM_UPDATE',
  priority: 'NORMAL', effectiveDate: null, audience: 'EVERYONE', audienceRoles: [], audienceStaffIds: [],
}

function patchReq(body: unknown) {
  return new NextRequest('https://walztravels.com/api/admin/announcements/ann-1', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
  mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(DRAFT_ANN)
  mockPrisma.staffAnnouncement.update.mockImplementation(({ data }: any) => ({ ...DRAFT_ANN, ...data }))
  notifyAnnouncementPublished.mockResolvedValue({ recipients: 3, notified: 3, emailsQueued: 3, emailsSent: 3, emailsFailed: 0, emailsSkipped: 0 })
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('401s when unauthenticated, 403s for a non-admin', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(null)
  expect((await PATCH(patchReq({ status: 'PUBLISHED' }), { params: { id: 'ann-1' } })).status).toBe(401)

  ;(getAdminSession as jest.Mock).mockResolvedValue({ ...ADMIN_SESSION, role: 'sales_rep' })
  expect((await PATCH(patchReq({ status: 'PUBLISHED' }), { params: { id: 'ann-1' } })).status).toBe(403)
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
})

it('publishing a DRAFT calls the notify orchestrator exactly once with the updated fields and the acting admin as actor', async () => {
  const res = await PATCH(patchReq({ status: 'PUBLISHED' }), { params: { id: 'ann-1' } })
  expect(res.status).toBe(200)
  expect(notifyAnnouncementPublished).toHaveBeenCalledTimes(1)
  expect(notifyAnnouncementPublished).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'ann-1', title: 'T' }),
    { staffId: 'admin-1', staffName: 'Super Admin', staffRole: 'super_admin' },
  )
  const body = await res.json()
  expect(body.notify).toEqual({ recipients: 3, notified: 3, emailsQueued: 3, emailsSent: 3, emailsFailed: 0, emailsSkipped: 0 })
})

it('does NOT re-notify when an already-PUBLISHED announcement is merely edited', async () => {
  mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...DRAFT_ANN, status: 'PUBLISHED' })
  const res = await PATCH(patchReq({ title: 'Edited title' }), { params: { id: 'ann-1' } })
  expect(res.status).toBe(200)
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
  const body = await res.json()
  expect(body.notify).toBeNull()
})

it('does NOT notify for a status change to something other than PUBLISHED (e.g. ARCHIVED)', async () => {
  mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...DRAFT_ANN, status: 'APPROVED' })
  await PATCH(patchReq({ status: 'ARCHIVED' }), { params: { id: 'ann-1' } })
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
})

it('a notify failure is swallowed — the PATCH still returns 200 with the announcement updated', async () => {
  notifyAnnouncementPublished.mockRejectedValue(new Error('notify pipeline exploded'))
  const res = await PATCH(patchReq({ status: 'PUBLISHED' }), { params: { id: 'ann-1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.announcement.status).toBe('PUBLISHED')
  expect(body.notify).toBeNull()
})

it('404s for a non-existent announcement', async () => {
  mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(null)
  expect((await PATCH(patchReq({ status: 'PUBLISHED' }), { params: { id: 'ann-1' } })).status).toBe(404)
})
