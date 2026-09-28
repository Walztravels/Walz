import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAuthenticatedStaff } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'
import { ACKNOWLEDGEMENT_TEXT } from '@/lib/performance/acknowledgement'

export const dynamic = 'force-dynamic'

// POST /api/admin/performance/my-notices/[docId]/acknowledge (mission
// brief §9). The acknowledgement text is ALWAYS the fixed constant
// ACKNOWLEDGEMENT_TEXT — the request body's content is never used to set
// it, so this can never be made to say (or imply) agreement with the
// warning. Idempotent: re-acknowledging an already-acknowledged notice
// just returns the existing state, it does not overwrite the original
// acknowledgedAt timestamp.
export async function POST(_req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireAuthenticatedStaff()
  if (!auth.ok) return auth.error
  const { session } = auth
  const callerStaffId = session.staffId ?? session.id

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document || document.staffId !== callerStaffId) {
    return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  }
  if (document.status !== 'ISSUED' && document.status !== 'ACKNOWLEDGED') {
    return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  }

  if (document.acknowledgedAt) {
    return NextResponse.json({ acknowledgedAt: document.acknowledgedAt, acknowledgementText: document.acknowledgementText })
  }

  const now = new Date()
  await prisma.staffPerformanceDocument.update({
    where: { id: document.id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgementText: ACKNOWLEDGEMENT_TEXT },
  })

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: callerStaffId,
    actorName: session.name,
    action: 'ACKNOWLEDGED',
    documentVersion: document.version,
  })

  return NextResponse.json({ acknowledgedAt: now, acknowledgementText: ACKNOWLEDGEMENT_TEXT })
}
