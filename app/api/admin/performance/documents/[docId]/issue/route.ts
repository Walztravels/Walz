import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'
import { sendPerformanceNoticeEmail } from '@/lib/performance/email'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// POST /api/admin/performance/documents/[docId]/issue — APPROVE & ISSUE
// (mission brief §7/§8). This is the ONLY endpoint that ever sends a
// performance warning email. Requires an explicit body.confirm === true,
// matching the mandatory client-side confirmation dialog. The recipient
// email is ALWAYS resolved server-side from the Staff record — the
// request body is never trusted for an address. Idempotent: a document
// already ISSUED/ACKNOWLEDGED can never be re-sent from here (checked via
// an atomic compare-and-swap update before any email is sent).
export async function POST(req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const body = await req.json().catch(() => ({})) as { confirm?: boolean }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Explicit confirmation (confirm: true) is required to issue a performance warning.' }, { status: 400 })
  }

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.status !== 'DRAFT' && document.status !== 'APPROVED') {
    return NextResponse.json({ error: `Document already has status ${document.status} — it cannot be issued again.` }, { status: 409 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: document.staffId }, select: { id: true, name: true, email: true, isActive: true } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  // Freeze the immutable snapshot NOW, before any email attempt, so a
  // later draft edit (there is none possible once status flips, but this
  // also protects against a retry racing a concurrent edit) can never
  // alter what was actually issued.
  const issuedContent = document.draftContent
  const issuedContentHash = createHash('sha256').update(issuedContent).digest('hex')

  // Atomic compare-and-swap: only the request that wins this update
  // proceeds to send the email. A concurrent duplicate click gets 0 rows
  // updated and a clean 409 — no double-send.
  const cas = await prisma.staffPerformanceDocument.updateMany({
    where: { id: document.id, status: { in: ['DRAFT', 'APPROVED'] } },
    data: {
      status: 'ISSUED',
      issuedContent,
      issuedContentHash,
      issuedByStaffId: session.staffId ?? session.id,
      issuedByName: session.name,
    },
  })
  if (cas.count === 0) {
    return NextResponse.json({ error: 'Document was already issued by another request.' }, { status: 409 })
  }

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'APPROVED',
    documentVersion: document.version,
  })
  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'ISSUED',
    documentVersion: document.version,
  })

  // Update the case's nextReviewDate to this document's review date and
  // set the case into the right ongoing status, so it surfaces on the
  // Review Due dashboard.
  await prisma.staffPerformanceCase.update({
    where: { id: document.caseId },
    data: {
      nextReviewDate: document.reviewDate,
      status: document.warningType === 'PERFORMANCE_IMPROVEMENT_PLAN' ? 'PIP_ACTIVE' : 'REVIEW_DUE',
      managementAction: document.warningType === 'FINAL_WARNING' ? 'FINAL_WARNING_ISSUED' : document.warningType === 'FIRST_WRITTEN_WARNING' ? 'FIRST_WARNING_ISSUED' : undefined,
    },
  })

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'EMAIL_QUEUED',
    documentVersion: document.version,
  })

  const reviewUrl = `${BASE_URL}/admin/my-performance/${document.id}`
  const emailResult = await sendPerformanceNoticeEmail({
    toEmail: staff.email,
    employeeName: staff.name,
    reviewDateDisplay: fmt(document.reviewDate),
    reviewUrl,
  })

  if (emailResult.ok) {
    await prisma.staffPerformanceDocument.update({
      where: { id: document.id },
      data: { deliveredAt: new Date(), emailMessageId: emailResult.messageId ?? null },
    })
    await logPerformanceHistory({
      caseId: document.caseId,
      documentId: document.id,
      actorStaffId: session.staffId ?? session.id,
      actorName: session.name,
      action: 'EMAIL_SENT',
      documentVersion: document.version,
    })
  } else {
    await logPerformanceHistory({
      caseId: document.caseId,
      documentId: document.id,
      actorStaffId: session.staffId ?? session.id,
      actorName: session.name,
      action: 'EMAIL_FAILED',
      documentVersion: document.version,
      metadata: { error: emailResult.error },
    })
  }

  // Confidential — deliberately NOT via createStaffNotification's broadcast-
  // style categories used elsewhere; uses the same private, staffId-scoped
  // StaffNotification model but the MANAGEMENT category, which only that
  // one staff member can ever read (app/api/admin/notifications is scoped
  // to staffId: session.id).
  const { createStaffNotification } = await import('@/lib/notifications/staff')
  await createStaffNotification({
    staffId: staff.id,
    category: 'MANAGEMENT',
    title: 'A performance review document has been issued to you',
    body: `Please review it in My Performance Notices. Review date: ${fmt(document.reviewDate)}.`,
    important: true,
    sourceId: `performance-doc:${document.id}`,
    sourceType: 'performance_document',
  })

  const finalDocument = await prisma.staffPerformanceDocument.findUnique({ where: { id: document.id } })
  return NextResponse.json({ document: finalDocument, emailSent: emailResult.ok, emailError: emailResult.error })
}
