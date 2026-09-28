import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAuthenticatedStaff } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

const MAX_RESPONSE_LENGTH = 4000

// POST /api/admin/performance/my-notices/[docId]/respond — the employee's
// own written response/comment (mission brief §9). Stored once per
// notice; a further submission overwrites the previous response text but
// always keeps the latest employeeResponseAt, and every submission is
// recorded in the immutable history (never silently lost).
export async function POST(req: NextRequest, { params }: { params: { docId: string } }) {
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

  const body = await req.json().catch(() => ({})) as { response?: string }
  const response = (body.response ?? '').trim()
  if (!response) return NextResponse.json({ error: 'A response is required' }, { status: 400 })
  if (response.length > MAX_RESPONSE_LENGTH) {
    return NextResponse.json({ error: `Response must be ${MAX_RESPONSE_LENGTH} characters or fewer` }, { status: 400 })
  }

  const now = new Date()
  await prisma.staffPerformanceDocument.update({
    where: { id: document.id },
    data: { employeeResponse: response, employeeResponseAt: now },
  })

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: callerStaffId,
    actorName: session.name,
    action: 'EMPLOYEE_RESPONSE',
    documentVersion: document.version,
  })

  return NextResponse.json({ employeeResponseAt: now })
}
