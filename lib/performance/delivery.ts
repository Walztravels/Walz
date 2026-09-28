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
 *
 * The QUEUED transition itself is gated by an atomic compare-and-swap
 * (`updateMany` with `emailDeliveryStatus: { not: 'QUEUED' }`), mirroring
 * the issue route's own CAS pattern — found necessary by independent
 * review: without it, two overlapping Retry Email calls against the same
 * FAILED document could both read the pre-attempt state, both pass their
 * caller-side "not already SENT" check, and both independently call the
 * email provider (a real duplicate-send bug, not a hypothetical one).
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
  emailDeliveryStatus: 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED'
  emailDeliveryError: string | null
  deliveredAt: Date | null
  emailMessageId: string | null
  /** True when this call lost a concurrent race for the QUEUED transition
   *  — another attempt (a simultaneous Retry Email click, in practice) is
   *  already handling delivery for this document. This call made NO
   *  further writes and never called the email provider; the returned
   *  fields reflect whatever the winning call had written by the time
   *  this one re-read the row (see below). Found by independent review:
   *  without this CAS, two concurrent Retry Email requests against a
   *  FAILED document could both pass the "not already SENT" check and
   *  both independently email the employee. */
  skippedConcurrent?: true
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
  // Atomic compare-and-swap on the QUEUED transition itself — the same
  // pattern the issue route uses for the ISSUED transition. Only the
  // request that wins this update proceeds to resolve the recipient and
  // call the email provider; a concurrent duplicate call (e.g. two
  // overlapping Retry Email clicks while status is FAILED) gets 0 rows
  // updated and makes NO further writes, so it can never double-send.
  const cas = await prisma.staffPerformanceDocument.updateMany({
    where: { id: opts.documentId, emailDeliveryStatus: { not: 'QUEUED' } },
    data: { emailDeliveryStatus: 'QUEUED' },
  })
  if (cas.count === 0) {
    const current = await prisma.staffPerformanceDocument.findUnique({
      where: { id: opts.documentId },
      select: { emailDeliveryStatus: true, emailDeliveryError: true, deliveredAt: true, emailMessageId: true },
    })
    return {
      emailDeliveryStatus: (current?.emailDeliveryStatus as DeliveryAttemptResult['emailDeliveryStatus']) ?? 'QUEUED',
      emailDeliveryError: current?.emailDeliveryError ?? null,
      deliveredAt: current?.deliveredAt ?? null,
      emailMessageId: current?.emailMessageId ?? null,
      skippedConcurrent: true,
    }
  }

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
