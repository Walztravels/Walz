import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAuthenticatedStaff } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'
import { ACKNOWLEDGEMENT_TEXT } from '@/lib/performance/acknowledgement'

export const dynamic = 'force-dynamic'

// GET /api/admin/performance/my-notices/[docId] — a staff member's own
// notice detail. IDOR guard: the document's staffId (read back from the
// resolved row, never from the URL) must equal the caller's own id — a
// Super Admin who is not the addressee is NOT granted access here either
// (they use the separate /api/admin/performance/documents/[docId] route,
// which is Super-Admin-gated instead of self-gated).
export async function GET(_req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireAuthenticatedStaff()
  if (!auth.ok) return auth.error
  const { session } = auth
  const callerStaffId = session.staffId ?? session.id

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document || document.staffId !== callerStaffId) {
    // Same response for "not found" and "not yours" — never leaks which one.
    return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  }
  if (document.status !== 'ISSUED' && document.status !== 'ACKNOWLEDGED') {
    return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  }

  if (!document.openedAt) {
    await prisma.staffPerformanceDocument.update({ where: { id: document.id }, data: { openedAt: new Date() } })
    await logPerformanceHistory({
      caseId: document.caseId,
      documentId: document.id,
      actorStaffId: callerStaffId,
      actorName: session.name,
      action: 'OPENED',
      documentVersion: document.version,
    })
  }

  const fresh = await prisma.staffPerformanceDocument.findUnique({ where: { id: document.id } })
  return NextResponse.json({
    document: {
      id: fresh!.id,
      warningType: fresh!.warningType,
      status: fresh!.status,
      reviewDate: fresh!.reviewDate,
      content: fresh!.issuedContent ?? fresh!.draftContent,
      deliveredAt: fresh!.deliveredAt,
      openedAt: fresh!.openedAt,
      acknowledgedAt: fresh!.acknowledgedAt,
      acknowledgementText: fresh!.acknowledgementText,
      employeeResponse: fresh!.employeeResponse,
      employeeResponseAt: fresh!.employeeResponseAt,
    },
    acknowledgementPromptText: ACKNOWLEDGEMENT_TEXT,
  })
}
