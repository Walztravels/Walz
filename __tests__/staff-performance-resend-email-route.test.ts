/**
 * POST /api/admin/performance/documents/[docId]/resend-email — "Retry
 * Email" (mission remediation P1). Super-Admin-only, idempotent, never
 * touches the immutable issued snapshot or the document's status, and
 * never generates a second performance notice.
 */
const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

const attemptDeliverPerformanceNotice = jest.fn()
jest.mock('@/lib/performance/delivery', () => ({
  attemptDeliverPerformanceNotice: (...args: unknown[]) => attemptDeliverPerformanceNotice(...args),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { logPerformanceHistory } from '@/lib/performance/history'
import { POST } from '@/app/api/admin/performance/documents/[docId]/resend-email/route'

const SUPER_ADMIN = { id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' }
const ISSUED_DOC = {
  id: 'doc1', caseId: 'case1', version: 1, status: 'ISSUED', staffId: 's2',
  reviewDate: new Date('2026-09-29'), emailDeliveryStatus: 'FAILED',
  issuedContent: 'FROZEN CONTENT', issuedContentHash: 'abc123',
}
const ctx = { params: { docId: 'doc1' } }
function req() {
  return {} as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC })
  attemptDeliverPerformanceNotice.mockResolvedValue({
    emailDeliveryStatus: 'SENT', emailDeliveryError: null, deliveredAt: new Date(), emailMessageId: 'm1',
  })
})

it('401/403 — non-Super-Admin cannot retry', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(null)
  expect((await POST(req(), ctx)).status).toBe(401)
  ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', staffRole: 'sales_rep' })
  expect((await POST(req(), ctx)).status).toBe(403)
  expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
})

it('404s an unknown document', async () => {
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
  expect((await POST(req(), ctx)).status).toBe(404)
})

it('409s a DRAFT or APPROVED document — nothing has been issued yet to retry', async () => {
  for (const status of ['DRAFT', 'APPROVED']) {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC, status })
    const res = await POST(req(), ctx)
    expect(res.status).toBe(409)
  }
  expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
})

it('retries a FAILED delivery — calls the shared delivery module with the SAME document/staff, never a new notice', async () => {
  const res = await POST(req(), ctx)
  expect(res.status).toBe(200)
  expect(attemptDeliverPerformanceNotice).toHaveBeenCalledWith(
    expect.objectContaining({ documentId: 'doc1', staffId: 's2', isRetry: true }),
  )
  const json = await res.json()
  expect(json).toEqual({ delivery: { status: 'SENT', error: null }, noop: false, concurrentRetryInProgress: false })
})

it('idempotent no-op: retrying an already-SENT document never calls the email provider again', async () => {
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC, emailDeliveryStatus: 'SENT' })
  const res = await POST(req(), ctx)
  expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
  const json = await res.json()
  expect(json).toEqual({ delivery: { status: 'SENT', error: null }, noop: true })
})

it('repeated retry after SENT does not duplicate delivery even across multiple calls', async () => {
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC, emailDeliveryStatus: 'SENT' })
  await POST(req(), ctx)
  await POST(req(), ctx)
  await POST(req(), ctx)
  expect(attemptDeliverPerformanceNotice).not.toHaveBeenCalled()
})

it('every retry attempt is recorded in history, including the no-op case', async () => {
  await POST(req(), ctx)
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_RETRY_REQUESTED' }))

  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC, emailDeliveryStatus: 'SENT' })
  await POST(req(), ctx)
  const actions = (logPerformanceHistory as jest.Mock).mock.calls.map((c) => c[0].action)
  expect(actions).toEqual(['EMAIL_RETRY_REQUESTED', 'EMAIL_RETRY_NOOP_ALREADY_SENT'])
})

it('never accepts or touches issuedContent/issuedContentHash/status — this route has no data field for any of them', async () => {
  await POST(req(), ctx)
  // The route takes no request body at all (req() returns an empty object
  // with no .json()), and passes only documentId/staffId/reviewDate/actor
  // fields to the delivery module — never issuedContent or status.
  const call = attemptDeliverPerformanceNotice.mock.calls[0][0]
  expect(call).not.toHaveProperty('issuedContent')
  expect(call).not.toHaveProperty('issuedContentHash')
  expect(call).not.toHaveProperty('status')
})

it('a FAILED retry result is returned as-is — the document remains ISSUED and immutable regardless', async () => {
  attemptDeliverPerformanceNotice.mockResolvedValue({
    emailDeliveryStatus: 'FAILED', emailDeliveryError: 'still down', deliveredAt: null, emailMessageId: null,
  })
  const res = await POST(req(), ctx)
  expect(res.status).toBe(200) // the RETRY request itself succeeded; delivery still failed
  const json = await res.json()
  expect(json).toEqual({ delivery: { status: 'FAILED', error: 'still down' }, noop: false, concurrentRetryInProgress: false })
})

it('surfaces concurrentRetryInProgress when the delivery module lost a concurrent CAS race (found by independent review)', async () => {
  attemptDeliverPerformanceNotice.mockResolvedValue({
    emailDeliveryStatus: 'QUEUED', emailDeliveryError: null, deliveredAt: null, emailMessageId: null, skippedConcurrent: true,
  })
  const res = await POST(req(), ctx)
  const json = await res.json()
  expect(json.concurrentRetryInProgress).toBe(true)
})

it('also works from ACKNOWLEDGED status (employee already acknowledged, email still needs retrying)', async () => {
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...ISSUED_DOC, status: 'ACKNOWLEDGED' })
  const res = await POST(req(), ctx)
  expect(res.status).toBe(200)
  expect(attemptDeliverPerformanceNotice).toHaveBeenCalled()
})
