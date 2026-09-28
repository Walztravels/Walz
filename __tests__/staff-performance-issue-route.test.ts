/**
 * POST /api/admin/performance/documents/[docId]/issue — Approve & Issue
 * (mission brief §7/§8). The single most sensitive endpoint in this
 * feature: it is the ONLY place an email is ever sent, and it must be
 * idempotent, confirmation-gated, and resolve the recipient server-side.
 */
const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  staff: { findUnique: jest.fn() },
  staffPerformanceCase: { update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))
jest.mock('@/lib/performance/email', () => ({ sendPerformanceNoticeEmail: jest.fn() }))
jest.mock('@/lib/notifications/staff', () => ({ createStaffNotification: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { sendPerformanceNoticeEmail } from '@/lib/performance/email'
import { createStaffNotification } from '@/lib/notifications/staff'
import { logPerformanceHistory } from '@/lib/performance/history'
import { POST } from '@/app/api/admin/performance/documents/[docId]/issue/route'

const SUPER_ADMIN = { id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' }
const DRAFT_DOC = {
  id: 'doc1',
  caseId: 'case1',
  status: 'DRAFT',
  version: 1,
  staffId: 's2',
  draftContent: 'Dear Jane, ... sales figures ... warning type details ...',
  warningType: 'FIRST_WRITTEN_WARNING',
  reviewDate: new Date('2026-09-29'),
}
const STAFF = { id: 's2', name: 'Jane Doe', email: 'jane@walztravels.com', isActive: true }
const ctx = { params: { docId: 'doc1' } }
function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC })
  mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
  mockPrisma.staff.findUnique.mockResolvedValue(STAFF)
  mockPrisma.staffPerformanceCase.update.mockResolvedValue({})
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'msg1' })
})

describe('POST /api/admin/performance/documents/[docId]/issue', () => {
  it('401/403 gate non-super-admins', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await POST(req({ confirm: true }), ctx)).status).toBe(401)
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', staffRole: 'sales_rep' })
    expect((await POST(req({ confirm: true }), ctx)).status).toBe(403)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
  })

  it('refuses without explicit confirm:true — no email on an unconfirmed request', async () => {
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(400)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
    expect(mockPrisma.staffPerformanceDocument.updateMany).not.toHaveBeenCalled()
  })

  it('refuses confirm:false too', async () => {
    const res = await POST(req({ confirm: false }), ctx)
    expect(res.status).toBe(400)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
  })

  it('404s an unknown document', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(404)
  })

  it('409s a document that is already ISSUED/ACKNOWLEDGED — never re-sends', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC, status: 'ISSUED' })
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(409)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
  })

  it('409s (idempotency) when the compare-and-swap update matches zero rows (a concurrent duplicate request already issued it)', async () => {
    mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 0 })
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(409)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
  })

  it('resolves the recipient address ONLY from the Staff record — an address in the request body is ignored entirely', async () => {
    await POST(req({ confirm: true, toEmail: 'attacker@evil.com' } as Record<string, unknown>), ctx)
    expect(sendPerformanceNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'jane@walztravels.com' }),
    )
  })

  it('freezes an immutable issuedContent + issuedContentHash BEFORE sending', async () => {
    await POST(req({ confirm: true }), ctx)
    const casCall = mockPrisma.staffPerformanceDocument.updateMany.mock.calls[0][0]
    expect(casCall.data.issuedContent).toBe(DRAFT_DOC.draftContent)
    expect(typeof casCall.data.issuedContentHash).toBe('string')
    expect(casCall.data.issuedContentHash.length).toBe(64) // sha256 hex
  })

  it('never places sales figures/warning type detail in the email body — only a generic notice + link', async () => {
    await POST(req({ confirm: true }), ctx)
    const emailArgs = (sendPerformanceNoticeEmail as jest.Mock).mock.calls[0][0]
    expect(emailArgs).not.toHaveProperty('salesInPeriod')
    expect(emailArgs).not.toHaveProperty('warningType')
    expect(emailArgs).not.toHaveProperty('draftContent')
    expect(Object.keys(emailArgs).sort()).toEqual(['employeeName', 'reviewDateDisplay', 'reviewUrl', 'toEmail'].sort())
  })

  it('the review link points into the authenticated admin portal, never a public path', async () => {
    await POST(req({ confirm: true }), ctx)
    const emailArgs = (sendPerformanceNoticeEmail as jest.Mock).mock.calls[0][0]
    expect(emailArgs.reviewUrl).toContain('/admin/my-performance/')
  })

  it('marks deliveredAt only after a successful send, and logs EMAIL_SENT', async () => {
    const res = await POST(req({ confirm: true }), ctx)
    const json = await res.json()
    expect(json.emailSent).toBe(true)
    expect(mockPrisma.staffPerformanceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) }),
    )
    expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_SENT' }))
  })

  it('logs EMAIL_FAILED and does not set deliveredAt when the email provider fails, but the document is still ISSUED', async () => {
    ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'SMTP down' })
    const res = await POST(req({ confirm: true }), ctx)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emailSent).toBe(false)
    expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_FAILED' }))
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) }),
    )
  })

  it('notifies the staff member via the private, staffId-scoped MANAGEMENT category — never a broadcast channel', async () => {
    await POST(req({ confirm: true }), ctx)
    expect(createStaffNotification).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 's2', category: 'MANAGEMENT' }),
    )
  })

  it('logs the full lifecycle: APPROVED, ISSUED, EMAIL_QUEUED, EMAIL_SENT', async () => {
    await POST(req({ confirm: true }), ctx)
    const actions = (logPerformanceHistory as jest.Mock).mock.calls.map((c) => c[0].action)
    expect(actions).toEqual(expect.arrayContaining(['APPROVED', 'ISSUED', 'EMAIL_QUEUED', 'EMAIL_SENT']))
  })
})
