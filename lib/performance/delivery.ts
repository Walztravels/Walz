/**
 * Staff Performance Management — email delivery state machine (mission
 * remediation P1, following the independent reviewer's CONDITIONAL GO).
 *
 * Issuance (`StaffPerformanceDocument.status` flipping to ISSUED) and
 * email delivery are two SEPARATE concerns. Issuance is authoritative and
 * immutable the instant it happens — a Resend outage must never roll it
 * back, must never be treated as "the warning didn't happen", and must
 * never block the employee's own authenticated access to the notice
 * (my-notices/[docId]/route.ts gates on `status`, never on delivery
 * state). This module is the ONLY place that ever attempts a send or
 * writes `emailDeliveryStatus`/`emailDeliveryError`/`deliveredAt`/
 * `emailMessageId` — both the initial send (issue/route.ts) and Retry
 * Email (resend-email/route.ts) call this same function, so the two
 * paths can never drift into different "attempt + record" behavior.
 *
 * States: NOT_SENT → QUEUED → SENT | FAILED. FAILED can be retried (back
 * to QUEUED). SENT is terminal for this function's purposes — callers
 * decide whether to call this at all for an already-SENT document; see
 * resend-email/route.ts's explicit no-op branch for "repeated retry after
 * SENT does not duplicate delivery."
 */

import prisma from '@/lib/db'
import { logPerformanceHistory } from '@/lib/performance/history'
import { sendPerformanceNoticeEmail } from '@/lib/performance/email'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
const MAX_STORED_ERROR_LENGTH = 300

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Defensive cap only — sendPerformanceNoticeEmail already reduces
 *  provider errors to a plain message string (never a raw exception,
 *  stack trace, or API key); this just bounds what gets persisted. */
function sanitizeDeliveryError(message: string): string {
  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

export interface DeliveryAttemptOptions {
  documentId: string
  caseId: string
  documentVersion: number
  staffId: string
  reviewDate: Date
  actorStaffId: string | null
  actorName: string | null
  /** True when called from Retry Email rather than the original Approve & Issue send — carried into history metadata only, changes no logic. */
  isRetry: boolean
}

export interface DeliveryAttemptResult {
  emailDeliveryStatus: 'SENT' | 'FAILED'
  emailDeliveryError: string | null
  deliveredAt: Date | null
  emailMessageId: string | null
}

/**
 * Attempts (or re-attempts) delivery of an already-issued document's
 * notification email. The recipient is ALWAYS re-resolved server-side
 * from the Staff table — this function takes no address parameter at
 * all, so there is no argument a caller could even misuse to override it.
 */
export async function attemptDeliverPerformanceNotice(
  opts: DeliveryAttemptOptions,
): Promise<DeliveryAttemptResult> {
  await prisma.staffPerformanceDocument.update({
    where: { id: opts.documentId },
    data: { emailDeliveryStatus: 'QUEUED' },
  })
  await logPerformanceHistory({
    caseId: opts.caseId,
    documentId: opts.documentId,
    actorStaffId: opts.actorStaffId,
    actorName: opts.actorName,
    action: 'EMAIL_QUEUED',
    documentVersion: opts.documentVersion,
    metadata: opts.isRetry ? { retry: true } : undefined,
  })

  const staff = await prisma.staff.findUnique({
    where: { id: opts.staffId },
    select: { name: true, email: true },
  })

  if (!staff) {
    const error = 'Staff member not found — cannot resolve recipient email'
    await prisma.staffPerformanceDocument.update({
      where: { id: opts.documentId },
      data: { emailDeliveryStatus: 'FAILED', emailDeliveryError: error },
    })
    await logPerformanceHistory({
      caseId: opts.caseId,
      documentId: opts.documentId,
      actorStaffId: opts.actorStaffId,
      actorName: opts.actorName,
      action: 'EMAIL_FAILED',
      documentVersion: opts.documentVersion,
      metadata: { retry: opts.isRetry, error },
    })
    return { emailDeliveryStatus: 'FAILED', emailDeliveryError: error, deliveredAt: null, emailMessageId: null }
  }

  const reviewUrl = `${BASE_URL}/admin/my-performance/${opts.documentId}`
  const result = await sendPerformanceNoticeEmail({
    toEmail: staff.email,
    employeeName: staff.name,
    reviewDateDisplay: fmt(opts.reviewDate),
    reviewUrl,
  })

  if (result.ok) {
    const deliveredAt = new Date()
    const emailMessageId = result.messageId ?? null
    await prisma.staffPerformanceDocument.update({
      where: { id: opts.documentId },
      data: { emailDeliveryStatus: 'SENT', deliveredAt, emailMessageId, emailDeliveryError: null },
    })
    await logPerformanceHistory({
      caseId: opts.caseId,
      documentId: opts.documentId,
      actorStaffId: opts.actorStaffId,
      actorName: opts.actorName,
      action: 'EMAIL_SENT',
      documentVersion: opts.documentVersion,
      metadata: opts.isRetry ? { retry: true } : undefined,
    })
    return { emailDeliveryStatus: 'SENT', emailDeliveryError: null, deliveredAt, emailMessageId }
  }

  const error = sanitizeDeliveryError(result.error ?? 'Unknown email error')
  await prisma.staffPerformanceDocument.update({
    where: { id: opts.documentId },
    data: { emailDeliveryStatus: 'FAILED', emailDeliveryError: error },
  })
  await logPerformanceHistory({
    caseId: opts.caseId,
    documentId: opts.documentId,
    actorStaffId: opts.actorStaffId,
    actorName: opts.actorName,
    action: 'EMAIL_FAILED',
    documentVersion: opts.documentVersion,
    metadata: { retry: opts.isRetry, error },
  })
  return { emailDeliveryStatus: 'FAILED', emailDeliveryError: error, deliveredAt: null, emailMessageId: null }
}
