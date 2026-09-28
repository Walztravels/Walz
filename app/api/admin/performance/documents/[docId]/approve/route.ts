import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

// POST /api/admin/performance/documents/[docId]/approve — marks the draft
// APPROVED. Does NOT send anything or notify the employee — sending only
// ever happens via the separate /issue endpoint, which itself requires an
// explicit client-side confirmation step (mission brief §8).
export async function POST(_req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.status !== 'DRAFT') {
    return NextResponse.json({ error: `Cannot approve a document with status ${document.status}.` }, { status: 409 })
  }

  const updated = await prisma.staffPerformanceDocument.updateMany({
    where: { id: document.id, status: 'DRAFT' },
    data: { status: 'APPROVED' },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: 'Document was already updated by another request.' }, { status: 409 })
  }

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'APPROVED',
    documentVersion: document.version,
  })

  const result = await prisma.staffPerformanceDocument.findUnique({ where: { id: document.id } })
  return NextResponse.json({ document: result })
}
