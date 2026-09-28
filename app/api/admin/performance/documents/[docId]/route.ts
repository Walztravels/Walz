import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

// GET /api/admin/performance/documents/[docId] — Super Admin only.
export async function GET(_req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Display-only identity join (no FK on the model, matching the
  // repo-wide convention) — used ONLY to show the resolved recipient in
  // the Approve & Issue confirmation dialog; the actual send always
  // re-resolves the address server-side from Staff at issue time.
  const staff = await prisma.staff.findUnique({ where: { id: document.staffId }, select: { email: true, isActive: true } })

  return NextResponse.json({ document, staffEmail: staff?.email ?? null, staffActive: staff?.isActive ?? null })
}

// PATCH /api/admin/performance/documents/[docId] — edit the DRAFT (mission
// brief §7: "Editing the draft after issuance must not silently alter the
// historical issued document"). Only draftContent/additionalNotes/
// requiredImprovement/pipDurationDays/reviewDate are editable, and ONLY
// while status === 'DRAFT'. Once APPROVED/ISSUED, this always 409s.
export async function PATCH(req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const existing = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') {
    return NextResponse.json({ error: `Cannot edit a document with status ${existing.status}. Issued documents are immutable.` }, { status: 409 })
  }

  const body = await req.json().catch(() => ({})) as {
    draftContent?: string
    requiredImprovement?: string
    pipDurationDays?: number | null
    reviewDate?: string
    additionalNotes?: string | null
  }

  const data: Record<string, unknown> = {}
  if (body.draftContent !== undefined) data.draftContent = body.draftContent
  if (body.requiredImprovement !== undefined) data.requiredImprovement = body.requiredImprovement
  if (body.pipDurationDays !== undefined) data.pipDurationDays = body.pipDurationDays
  if (body.reviewDate !== undefined) data.reviewDate = new Date(body.reviewDate)
  if (body.additionalNotes !== undefined) data.additionalNotes = body.additionalNotes

  const updated = await prisma.staffPerformanceDocument.update({ where: { id: params.docId }, data })

  await logPerformanceHistory({
    caseId: existing.caseId,
    documentId: existing.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'EDITED',
    documentVersion: existing.version,
  })

  return NextResponse.json({ document: updated })
}
