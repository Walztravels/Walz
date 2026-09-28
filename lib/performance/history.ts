/**
 * Staff Performance Management — immutable action history (mission brief
 * §11). Writes only, never edited/deleted, and never stores sensitive
 * document contents (only small structured metadata), matching the
 * ActivityLog convention already used elsewhere in this codebase.
 */

import prisma from '@/lib/db'

export type PerformanceHistoryAction =
  | 'CASE_OPENED'
  | 'NOTES_UPDATED'
  | 'DRAFTED'
  | 'EDITED'
  | 'JADE_ASSIST'
  | 'APPROVED'
  | 'ISSUED'
  | 'EMAIL_QUEUED'
  | 'EMAIL_SENT'
  | 'EMAIL_FAILED'
  | 'OPENED'
  | 'ACKNOWLEDGED'
  | 'EMPLOYEE_RESPONSE'
  | 'REMINDER_SENT'
  | 'REVIEW_COMPLETED'
  | 'CLOSED'

interface LogPerformanceHistoryOpts {
  caseId: string
  documentId?: string
  actorStaffId?: string | null
  actorName?: string | null
  action: PerformanceHistoryAction
  documentVersion?: number
  metadata?: Record<string, unknown>
}

export async function logPerformanceHistory(opts: LogPerformanceHistoryOpts): Promise<void> {
  try {
    await prisma.staffPerformanceHistory.create({
      data: {
        caseId: opts.caseId,
        documentId: opts.documentId ?? null,
        actorStaffId: opts.actorStaffId ?? null,
        actorName: opts.actorName ?? null,
        action: opts.action,
        documentVersion: opts.documentVersion ?? null,
        metadata: opts.metadata ? (opts.metadata as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    // Best-effort, never blocks the caller — matches lib/team/activity.ts convention.
    console.warn('[performance/history] write failed:', (err as Error).message)
  }
}
