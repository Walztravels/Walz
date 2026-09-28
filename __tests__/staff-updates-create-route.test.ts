/**
 * Staff Updates — POST /api/admin/announcements (the "New Announcement" form's
 * create endpoint).
 *
 * Found during production acceptance testing: the New Announcement page's
 * "Publish Now" button creates the row already PUBLISHED via this route —
 * there is never a subsequent PATCH transition for that flow, so this route
 * is the ONLY place that path can fan out notifications from. The original
 * implementation wired the orchestrator into PATCH only; this covers the
 * create-time publish path the same way, with the same failure-isolation
 * guarantee.
 */

const mockPrisma = {
  staffAnnouncement: { create: jest.fn() },
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
import { POST } from '@/app/api/admin/announcements/route'

const ADMIN_SESSION = { id: 'admin-1', role: 'super_admin', name: 'Super Admin', email: 'admin@walztravels.com' }

const VALID_BODY = {
  title: 'T', category: 'SYSTEM_UPDATE', summary: 'S', detail: 'D',
  audience: 'EVERYONE', priority: 'NORMAL',
}

function postReq(body: unknown) {
  return new NextRequest('https://walztravels.com/api/admin/announcements', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
  mockPrisma.staffAnnouncement.create.mockImplementation(({ data }: any) => ({ id: 'ann-new', ...data }))
  notifyAnnouncementPublished.mockResolvedValue({ recipients: 1, notified: 1, emailsQueued: 1, emailsSent: 1, emailsFailed: 0, emailsSkipped: 0 })
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('401s when unauthenticated, 403s for a non-admin', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(null)
  expect((await POST(postReq(VALID_BODY))).status).toBe(401)

  ;(getAdminSession as jest.Mock).mockResolvedValue({ ...ADMIN_SESSION, role: 'sales_rep' })
  expect((await POST(postReq(VALID_BODY))).status).toBe(403)
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
})

it('400s when required fields are missing', async () => {
  const res = await POST(postReq({ title: 'T' }))
  expect(res.status).toBe(400)
  expect(mockPrisma.staffAnnouncement.create).not.toHaveBeenCalled()
})

it('creating as DRAFT (the default) never calls the notify orchestrator', async () => {
  const res = await POST(postReq(VALID_BODY))
  expect(res.status).toBe(200)
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
  const body = await res.json()
  expect(body.notify).toBeNull()
})

it('"Publish Now" at creation (status: PUBLISHED) DOES call the notify orchestrator exactly once', async () => {
  const res = await POST(postReq({ ...VALID_BODY, status: 'PUBLISHED' }))
  expect(res.status).toBe(200)
  expect(notifyAnnouncementPublished).toHaveBeenCalledTimes(1)
  expect(notifyAnnouncementPublished).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'ann-new', title: 'T' }),
    { staffId: 'admin-1', staffName: 'Super Admin', staffRole: 'super_admin' },
  )
  const body = await res.json()
  expect(body.notify).toEqual({ recipients: 1, notified: 1, emailsQueued: 1, emailsSent: 1, emailsFailed: 0, emailsSkipped: 0 })
})

it('a notify failure at create-time is swallowed — the create still returns 200 with the announcement', async () => {
  notifyAnnouncementPublished.mockRejectedValue(new Error('notify pipeline exploded'))
  const res = await POST(postReq({ ...VALID_BODY, status: 'PUBLISHED' }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.announcement.id).toBe('ann-new')
  expect(body.notify).toBeNull()
})

it('APPROVED status (not yet PUBLISHED) does not notify', async () => {
  await POST(postReq({ ...VALID_BODY, status: 'APPROVED' }))
  expect(notifyAnnouncementPublished).not.toHaveBeenCalled()
})
