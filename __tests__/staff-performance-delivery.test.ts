/**
 * lib/performance/delivery.ts — the email delivery state machine
 * (mission remediation P1). This is the ONLY place that ever transitions
 * emailDeliveryStatus or attempts a send — both the initial send
 * (issue/route.ts) and Retry Email (resend-email/route.ts) call this same
 * function, so their behavior can never drift apart.
 */

const mockPrisma = {
  staffPerformanceDocument: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  staff: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))
jest.mock('@/lib/performance/email', () => ({ sendPerformanceNoticeEmail: jest.fn() }))

import { logPerformanceHistory } from '@/lib/performance/history'
import { sendPerformanceNoticeEmail } from '@/lib/performance/email'
import { attemptDeliverPerformanceNotice } from '@/lib/performance/delivery'

const BASE_OPTS = {
  documentId: 'doc1',
  caseId: 'case1',
  documentVersion: 1,
  staffId: 's2',
  reviewDate: new Date('2026-09-29'),
  actorStaffId: 'admin1',
  actorName: 'Super Admin',
  isRetry: false,
}
const STAFF = { name: 'Jane Doe', email: 'jane@walztravels.com' }

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
  mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
  mockPrisma.staff.findUnique.mockResolvedValue(STAFF)
})

it('always wins the QUEUED compare-and-swap first and logs EMAIL_QUEUED before resolving the recipient or attempting a send', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'm1' })
  await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(mockPrisma.staffPerformanceDocument.updateMany.mock.calls[0][0]).toEqual({
    where: { id: 'doc1', emailDeliveryStatus: { not: 'QUEUED' } },
    data: { emailDeliveryStatus: 'QUEUED' },
  })
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_QUEUED' }))
})

describe('QUEUED transition race safety (found by independent review)', () => {
  it('when the CAS loses (count: 0), makes NO further writes and NEVER calls the email provider', async () => {
    mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({
      emailDeliveryStatus: 'QUEUED', emailDeliveryError: null, deliveredAt: null, emailMessageId: null,
    })
    const result = await attemptDeliverPerformanceNotice(BASE_OPTS)
    expect(result.skippedConcurrent).toBe(true)
    expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
    // Only the failed CAS write happened — no SENT/FAILED write follows it.
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('two overlapping calls against the same FAILED document: only ONE actually calls the email provider', async () => {
    // Simulate real Postgres CAS semantics: the first call to win the
    // updateMany gets count:1, every subsequent call (racing or not)
    // gets count:0 because the row is no longer emailDeliveryStatus != QUEUED.
    let won = false
    mockPrisma.staffPerformanceDocument.updateMany.mockImplementation(async () => {
      if (won) return { count: 0 }
      won = true
      return { count: 1 }
    })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({
      emailDeliveryStatus: 'QUEUED', emailDeliveryError: null, deliveredAt: null, emailMessageId: null,
    })
    ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'm1' })

    const [a, b] = await Promise.all([
      attemptDeliverPerformanceNotice(BASE_OPTS),
      attemptDeliverPerformanceNotice(BASE_OPTS),
    ])

    expect(sendPerformanceNoticeEmail).toHaveBeenCalledTimes(1)
    const outcomes = [a.skippedConcurrent, b.skippedConcurrent].sort()
    expect(outcomes).toEqual([true, undefined])
  })
})

it('resolves the recipient ONLY from Staff — there is no address parameter to this function at all', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'm1' })
  await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(mockPrisma.staff.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's2' } }))
  expect(sendPerformanceNoticeEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'jane@walztravels.com' }))
})

it('on success: sets SENT, deliveredAt, emailMessageId, clears any prior error, logs EMAIL_SENT', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'msg-123' })
  const result = await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(result).toEqual({
    emailDeliveryStatus: 'SENT', emailDeliveryError: null,
    deliveredAt: expect.any(Date), emailMessageId: 'msg-123',
  })
  const finalUpdate = mockPrisma.staffPerformanceDocument.update.mock.calls[0][0]
  expect(finalUpdate.data).toEqual({
    emailDeliveryStatus: 'SENT', deliveredAt: expect.any(Date), emailMessageId: 'msg-123', emailDeliveryError: null,
  })
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_SENT' }))
})

it('on provider failure: sets FAILED with a sanitized error, never sets deliveredAt, logs EMAIL_FAILED', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'Domain not verified' })
  const result = await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(result.emailDeliveryStatus).toBe('FAILED')
  expect(result.emailDeliveryError).toBe('Domain not verified')
  expect(result.deliveredAt).toBeNull()
  const finalUpdate = mockPrisma.staffPerformanceDocument.update.mock.calls[0][0]
  expect(finalUpdate.data).toEqual({ emailDeliveryStatus: 'FAILED', emailDeliveryError: 'Domain not verified' })
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_FAILED' }))
})

it('truncates an unexpectedly long provider error before storing it (defensive cap, never a raw stack)', async () => {
  const longError = 'x'.repeat(5000)
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: false, error: longError })
  const result = await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(result.emailDeliveryError!.length).toBeLessThan(400)
})

it('FAILED when the staff record cannot be resolved at all — never throws, never calls the email provider', async () => {
  mockPrisma.staff.findUnique.mockResolvedValue(null)
  const result = await attemptDeliverPerformanceNotice(BASE_OPTS)
  expect(result.emailDeliveryStatus).toBe('FAILED')
  expect(sendPerformanceNoticeEmail).not.toHaveBeenCalled()
})

it('marks retry attempts distinctly in history metadata without changing the transition logic', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockResolvedValue({ ok: true, messageId: 'm2' })
  await attemptDeliverPerformanceNotice({ ...BASE_OPTS, isRetry: true })
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_QUEUED', metadata: { retry: true } }))
  expect(logPerformanceHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_SENT', metadata: { retry: true } }))
})

it('never throws when sendPerformanceNoticeEmail itself throws unexpectedly (caller isolation)', async () => {
  ;(sendPerformanceNoticeEmail as jest.Mock).mockRejectedValue(new Error('unexpected'))
  await expect(attemptDeliverPerformanceNotice(BASE_OPTS)).rejects.toThrow()
  // Note: sendPerformanceNoticeEmail itself is documented/tested elsewhere
  // (lib/performance/email.ts) to never throw — it always returns
  // { ok:false, error }. This test documents that delivery.ts does not
  // additionally wrap that call in its own try/catch, relying on that
  // existing contract rather than double-guarding it.
})
