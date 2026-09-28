/**
 * Staff Updates — lib/staff-updates/notify.ts (the publish→notify orchestrator)
 *
 * Covers: recipient resolution, in-app notification dedup delegation,
 * email delivery bookkeeping + idempotent retry (never double-emails a
 * SENT/QUEUED recipient, does retry a FAILED one), total failure
 * isolation (a resolver/notification/email/ActivityLog failure never
 * throws back to the caller), and the ActivityLog audit write.
 */

const mockPrisma = {
  announcementEmailDelivery: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  activityLog: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const resolveAnnouncementRecipients = jest.fn()
jest.mock('@/lib/staff-updates/audience', () => ({
  __esModule: true,
  resolveAnnouncementRecipients: (...args: unknown[]) => resolveAnnouncementRecipients(...args),
}))

const createStaffNotification = jest.fn()
jest.mock('@/lib/notifications/staff', () => ({
  __esModule: true,
  createStaffNotification: (...args: unknown[]) => createStaffNotification(...args),
}))

const sendAnnouncementEmail = jest.fn()
jest.mock('@/lib/email-announcement-notification', () => ({
  __esModule: true,
  sendAnnouncementEmail: (...args: unknown[]) => sendAnnouncementEmail(...args),
}))

import { notifyAnnouncementPublished, type AnnouncementForNotify } from '@/lib/staff-updates/notify'

const ann: AnnouncementForNotify = {
  id: 'ann-1', title: 'Update', summary: 'Summary', category: 'SYSTEM_UPDATE',
  priority: 'HIGH', effectiveDate: null,
  audience: 'EVERYONE', audienceRoles: [], audienceStaffIds: [],
}
const actor = { staffId: 'admin-1', staffName: 'Super Admin', staffRole: 'super_admin' }

const staff1 = { id: 's1', name: 'Ada', email: 'ada@walztravels.com', role: 'sales_rep', department: 'sales' }
const staff2 = { id: 's2', name: 'Bo',  email: 'bo@walztravels.com',  role: 'sales_rep', department: 'sales' }

beforeEach(() => {
  jest.clearAllMocks()
  resolveAnnouncementRecipients.mockResolvedValue([staff1, staff2])
  createStaffNotification.mockResolvedValue('notif-id')
  sendAnnouncementEmail.mockResolvedValue({ ok: true, providerMessageId: 'msg-1' })
  mockPrisma.announcementEmailDelivery.findUnique.mockResolvedValue(null)
  mockPrisma.announcementEmailDelivery.create.mockImplementation(({ data }: any) => ({ id: `delivery-${data.staffId}`, ...data }))
  mockPrisma.announcementEmailDelivery.update.mockResolvedValue({})
  mockPrisma.activityLog.create.mockResolvedValue({})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('notifyAnnouncementPublished — happy path', () => {
  it('resolves recipients, notifies each in-app, and emails each once', async () => {
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(resolveAnnouncementRecipients).toHaveBeenCalledWith(ann)
    expect(createStaffNotification).toHaveBeenCalledTimes(2)
    expect(createStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 's1', sourceId: 'ann-1', sourceType: 'announcement',
    }))
    expect(sendAnnouncementEmail).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      recipients: 2, notified: 2, emailsQueued: 2, emailsSent: 2, emailsFailed: 0, emailsSkipped: 0,
    })
  })

  it('only marks important=true for URGENT, not HIGH', async () => {
    await notifyAnnouncementPublished({ ...ann, priority: 'HIGH' }, actor)
    expect(createStaffNotification).toHaveBeenCalledWith(expect.objectContaining({ important: false }))
  })

  it('marks important=true for URGENT', async () => {
    await notifyAnnouncementPublished({ ...ann, priority: 'URGENT' }, actor)
    expect(createStaffNotification).toHaveBeenCalledWith(expect.objectContaining({ important: true }))
  })

  it('resolves the recipient email server-side from Staff — never anything passed in from a caller', async () => {
    await notifyAnnouncementPublished(ann, actor)
    expect(sendAnnouncementEmail).toHaveBeenCalledWith(expect.objectContaining({ staffEmail: 'ada@walztravels.com', staffId: 's1' }))
    expect(sendAnnouncementEmail).toHaveBeenCalledWith(expect.objectContaining({ staffEmail: 'bo@walztravels.com', staffId: 's2' }))
  })

  it('writes one ActivityLog audit entry summarizing the run', async () => {
    await notifyAnnouncementPublished(ann, actor)
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        staffId: 'admin-1', action: 'announcement.published.notified', entityId: 'ann-1', entityType: 'StaffAnnouncement',
      }),
    }))
  })

  it('accepts a null actor staffId (system/cron trigger) without violating the ActivityLog FK', async () => {
    await notifyAnnouncementPublished(ann, { staffId: null, staffName: 'Jade Daily Brief (cron)', staffRole: 'system' })
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ staffId: null, staffName: 'Jade Daily Brief (cron)' }),
    }))
  })
})

describe('notifyAnnouncementPublished — idempotent retry', () => {
  it('never re-sends to a recipient whose delivery is already SENT', async () => {
    mockPrisma.announcementEmailDelivery.findUnique.mockImplementation(({ where }: any) =>
      where.announcementId_staffId.staffId === 's1' ? { id: 'd1', status: 'SENT' } : null)
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(sendAnnouncementEmail).toHaveBeenCalledTimes(1)
    expect(sendAnnouncementEmail).toHaveBeenCalledWith(expect.objectContaining({ staffId: 's2' }))
    expect(result.emailsSkipped).toBe(1)
    expect(result.emailsQueued).toBe(1)
  })

  it('never re-sends to a recipient whose delivery is already QUEUED (avoids a concurrent double-send)', async () => {
    mockPrisma.announcementEmailDelivery.findUnique.mockResolvedValue({ id: 'd1', status: 'QUEUED' })
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(sendAnnouncementEmail).not.toHaveBeenCalled()
    expect(result.emailsSkipped).toBe(2)
  })

  it('DOES retry a recipient whose prior delivery FAILED', async () => {
    mockPrisma.announcementEmailDelivery.findUnique.mockResolvedValue({ id: 'd1', status: 'FAILED', staffId: 's1' })
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(sendAnnouncementEmail).toHaveBeenCalledTimes(2)
    expect(mockPrisma.announcementEmailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'd1' }, data: { status: 'QUEUED', failureReason: null },
    }))
    expect(result.emailsSent).toBe(2)
  })

  it("createStaffNotification's own sourceId dedup means a second full run is a safe no-op for in-app notifications", async () => {
    createStaffNotification.mockResolvedValue('existing-notif-id') // simulates the idempotency branch returning the existing id
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(result.notified).toBe(2) // still counted — a non-null id, new or existing, counts as "notified"
  })
})

describe('notifyAnnouncementPublished — failure isolation', () => {
  it('returns an empty/zeroed result (never throws) when recipient resolution fails', async () => {
    resolveAnnouncementRecipients.mockRejectedValue(new Error('db down'))
    await expect(notifyAnnouncementPublished(ann, actor)).resolves.toEqual({
      recipients: 0, notified: 0, emailsQueued: 0, emailsSent: 0, emailsFailed: 0, emailsSkipped: 0,
    })
  })

  it('one recipient failing in-app notification does not stop the others or the emails', async () => {
    createStaffNotification.mockRejectedValueOnce(new Error('write failed'))
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(result.notified).toBe(1) // only the second succeeded
    expect(result.emailsSent).toBe(2) // email path unaffected
  })

  it('marks the delivery FAILED and continues when sendAnnouncementEmail reports a failure', async () => {
    sendAnnouncementEmail.mockResolvedValueOnce({ ok: false, error: 'invalid_from' })
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(result.emailsFailed).toBe(1)
    expect(result.emailsSent).toBe(1)
    expect(mockPrisma.announcementEmailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', failureReason: 'invalid_from' }),
    }))
  })

  it('never throws even when the ActivityLog write itself fails', async () => {
    mockPrisma.activityLog.create.mockRejectedValue(new Error('fk violation'))
    await expect(notifyAnnouncementPublished(ann, actor)).resolves.toBeDefined()
  })

  it('never throws when there are zero recipients', async () => {
    resolveAnnouncementRecipients.mockResolvedValue([])
    const result = await notifyAnnouncementPublished(ann, actor)
    expect(result).toEqual({ recipients: 0, notified: 0, emailsQueued: 0, emailsSent: 0, emailsFailed: 0, emailsSkipped: 0 })
    expect(createStaffNotification).not.toHaveBeenCalled()
    expect(sendAnnouncementEmail).not.toHaveBeenCalled()
  })
})
