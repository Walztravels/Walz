/**
 * POST /api/admin/performance/documents/[docId]/issue — Approve & Issue
 * (mission brief §7/§8, remediated per mission P1). The single most
 * sensitive endpoint in this feature: it is the ONLY place a document is
 * ever issued, and it must be idempotent, confirmation-gated, and resolve
 * the recipient server-side. Issuance and email delivery are DELIBERATELY
 * separate — this file mocks lib/performance/delivery.ts (itself covered
 * by staff-performance-delivery.test.ts) so these tests focus on the
 * route's OWN responsibility: the atomic issue itself, independent of
 * whatever happens to the notification email afterwards.
 */
const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  staff: { findUnique: jest.fn() },
  staffPerformanceCase: { update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))
jest.mock('@/lib/notifications/staff', () => ({ createStaffNotification: jest.fn() }))

const attemptDeliverPerformanceNotice = jest.fn()
jest.mock('@/lib/performance/delivery', () => ({
  attemptDeliverPerformanceNotice: (...args: unknown[]) => attemptDeliverPerformanceNotice(...args),
}))

import { getAdminSession } from '@/lib/admin-auth'
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
  attemptDeliverPerformanceNotice.mockResolvedValue({
    emailDeliveryStatus: 'SENT', emailDeliveryError: null, deliveredAt: new Date(), emailMessageId: 'msg1',
  })
})

describe('POST /api/admin/performance/documents/[docId]/issue', () => {
  it('401/403 gate non-super-admins', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await POST(req({ confirm: true }), ctx)).status).toBe(401)
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', staffRole: 'sales_rep' })
    expect((await POST(req({ confirm: true }), ctx)).status).toBe(403)
    expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
  })

  it('refuses without explicit confirm:true — no issuance on an unconfirmed request', async () => {
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(400)
    expect(mockPrisma.staffPerformanceDocument.updateMany).not.toHaveBeenCalled()
    expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
  })

  it('refuses confirm:false too', async () => {
    const res = await POST(req({ confirm: false }), ctx)
    expect(res.status).toBe(400)
  })

  it('404s an unknown document', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(404)
  })

  it('409s a document that is already ISSUED/ACKNOWLEDGED — never re-issues', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC, status: 'ISSUED' })
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(409)
    expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
  })

  it('409s (idempotency) when the compare-and-swap update matches zero rows (a concurrent duplicate request already issued it) — never creates a second warning', async () => {
    mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 0 })
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(409)
    expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
  })

  it('freezes an immutable issuedContent + issuedContentHash BEFORE attempting delivery', async () => {
    await POST(req({ confirm: true }), ctx)
    const casCall = mockPrisma.staffPerformanceDocument.updateMany.mock.calls[0][0]
    expect(casCall.data.issuedContent).toBe(DRAFT_DOC.draftContent)
    expect(typeof casCall.data.issuedContentHash).toBe('string')
    expect(casCall.data.issuedContentHash.length).toBe(64) // sha256 hex
  })

  it('PROVIDER FAILURE CANNOT MUTATE THE IMMUTABLE ISSUED SNAPSHOT — the CAS already committed issuedContent/Hash before delivery is even attempted, and a FAILED delivery result never re-writes them', async () => {
    attemptDeliverPerformanceNotice.mockResolvedValue({ emailDeliveryStatus: 'FAILED', emailDeliveryError: 'outage', deliveredAt: null, emailMessageId: null })
    await POST(req({ confirm: true }), ctx)
    const casCall = mockPrisma.staffPerformanceDocument.updateMany.mock.calls[0][0]
    expect(casCall.data.issuedContent).toBe(DRAFT_DOC.draftContent)
    expect(casCall.data.issuedContentHash).toHaveLength(64)
    // The only other document write is inside attemptDeliverPerformanceNotice
    // (mocked here, tested separately) — issue/route.ts itself never calls
    // update() a second time with issuedContent/issuedContentHash.
    for (const call of mockPrisma.staffPerformanceDocument.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty('issuedContent')
      expect(call[0].data).not.toHaveProperty('issuedContentHash')
    }
  })

  it('email success after issuance: passes the resolved staffId/reviewDate/actor to the delivery module and returns delivery: { status: SENT }', async () => {
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(200)
    expect(attemptDeliverPerformanceNotice).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc1', staffId: 's2', isRetry: false }),
    )
    const json = await res.json()
    expect(json.delivery).toEqual({ status: 'SENT', error: null })
  })

  it('email failure after issuance: issuance still succeeds (200), document remains ISSUED, delivery reports FAILED — never a 500, never a rollback', async () => {
    attemptDeliverPerformanceNotice.mockResolvedValue({ emailDeliveryStatus: 'FAILED', emailDeliveryError: 'Resend outage', deliveredAt: null, emailMessageId: null })
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.delivery).toEqual({ status: 'FAILED', error: 'Resend outage' })
    // The CAS (the actual issuance) already committed unconditionally, before delivery was attempted.
    expect(mockPrisma.staffPerformanceDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ISSUED' }) }),
    )
  })

  it('never creates another performance notice/case when delivery fails — no second updateMany/create anywhere', async () => {
    attemptDeliverPerformanceNotice.mockResolvedValue({ emailDeliveryStatus: 'FAILED', emailDeliveryError: 'down', deliveredAt: null, emailMessageId: null })
    await POST(req({ confirm: true }), ctx)
    expect(mockPrisma.staffPerformanceDocument.updateMany).toHaveBeenCalledTimes(1)
  })

  it('notifies the staff member via the private, staffId-scoped MANAGEMENT category regardless of delivery outcome — My Performance Notices access never depends on email success', async () => {
    attemptDeliverPerformanceNotice.mockResolvedValue({ emailDeliveryStatus: 'FAILED', emailDeliveryError: 'down', deliveredAt: null, emailMessageId: null })
    await POST(req({ confirm: true }), ctx)
    expect(createStaffNotification).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 's2', category: 'MANAGEMENT' }),
    )
  })

  it('logs the issuance lifecycle: APPROVED, ISSUED (delivery lifecycle logging is delegated to, and tested in, lib/performance/delivery.ts)', async () => {
    await POST(req({ confirm: true }), ctx)
    const actions = (logPerformanceHistory as jest.Mock).mock.calls.map((c) => c[0].action)
    expect(actions).toEqual(expect.arrayContaining(['APPROVED', 'ISSUED']))
  })

  it('404s if the staff record cannot be resolved at all — never issues a warning with no recipient to attribute it to', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue(null)
    const res = await POST(req({ confirm: true }), ctx)
    expect(res.status).toBe(404)
    expect(mockPrisma.staffPerformanceDocument.updateMany).not.toHaveBeenCalled()
  })
})
