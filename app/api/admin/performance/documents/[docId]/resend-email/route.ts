import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'
import { attemptDeliverPerformanceNotice } from '@/lib/performance/delivery'

export const dynamic = 'force-dynamic'

// POST /api/admin/performance/documents/[docId]/resend-email — "Retry Email"
// (mission remediation P1). Super-Admin-only. Re-attempts delivery of the
// SAME already-issued notice — it never touches issuedContent/
// issuedContentHash/status, never re-derives or re-confirms the issue
// decision (that already happened, once, at /issue), and never accepts a
// recipient address from the request (there is no request body at all).
//
// Idempotent: retrying a document whose emailDeliveryStatus is already
// SENT is a deliberate no-op — it does not call the email provider again
// and cannot duplicate delivery. Every retry attempt (no-op or real) is
// recorded in the immutable history, so "someone clicked Retry" is always
// auditable even when nothing was actually re-sent.
export async function POST(_req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.status !== 'ISSUED' && document.status !== 'ACKNOWLEDGED') {
    return NextResponse.json(
      { error: `Cannot retry — document has status ${document.status}. Only an already-issued document's email can be retried.` },
      { status: 409 },
    )
  }

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'EMAIL_RETRY_REQUESTED',
    documentVersion: document.version,
  })

  if (document.emailDeliveryStatus === 'SENT') {
    await logPerformanceHistory({
      caseId: document.caseId,
      documentId: document.id,
      actorStaffId: session.staffId ?? session.id,
      actorName: session.name,
      action: 'EMAIL_RETRY_NOOP_ALREADY_SENT',
      documentVersion: document.version,
    })
    return NextResponse.json({
      delivery: { status: 'SENT', error: null },
      noop: true,
    })
  }

  const delivery = await attemptDeliverPerformanceNotice({
    documentId: document.id,
    caseId: document.caseId,
    documentVersion: document.version,
    staffId: document.staffId,
    reviewDate: document.reviewDate,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    isRetry: true,
  })

  return NextResponse.json({
    delivery: { status: delivery.emailDeliveryStatus, error: delivery.emailDeliveryError },
    noop: false,
  })
}
