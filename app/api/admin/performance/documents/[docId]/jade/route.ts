import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { callJadeAssist, type JadeAssistAction, type ProtectedFacts } from '@/lib/performance/jade'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTIONS: JadeAssistAction[] = [
  'DRAFT_WARNING',
  'REWRITE_PROFESSIONALLY',
  'MAKE_CONCISE',
  'CREATE_IMPROVEMENT_PLAN',
  'SUMMARIZE_EVIDENCE',
]

// POST /api/admin/performance/documents/[docId]/jade — Jade assistance
// (mission brief §6). Only operates on a DRAFT document, and its output
// is returned to the client for review — it is NOT auto-saved into
// draftContent (the Super Admin must explicitly accept it via the normal
// PATCH endpoint), keeping a human decision point between Jade's output
// and anything persisted.
export async function POST(req: NextRequest, { params }: { params: { docId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Jade can only assist with a document still in DRAFT status.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({})) as { action?: string; instruction?: string }
  if (!body.action || !ACTIONS.includes(body.action as JadeAssistAction)) {
    return NextResponse.json({ error: 'A valid action is required' }, { status: 400 })
  }

  const facts: ProtectedFacts = {
    employeeName: document.employeeNameSnapshot,
    jobTitle: document.jobTitleSnapshot,
    department: document.departmentSnapshot,
    employmentStatus: 'active', // resolved server-side elsewhere; not user-editable here
    warningType: document.warningType,
    reviewPeriodStart: document.reviewPeriodStart.toISOString(),
    reviewPeriodEnd: document.reviewPeriodEnd.toISOString(),
    salesInPeriod: document.salesInPeriod,
    lastSaleDate: document.lastSaleDate ? document.lastSaleDate.toISOString() : null,
    reviewDate: document.reviewDate.toISOString(),
    warningHistorySummary: document.warningHistorySummary,
  }

  const result = await callJadeAssist({
    action: body.action as JadeAssistAction,
    facts,
    currentDraftText: document.draftContent,
    instruction: body.instruction,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  await logPerformanceHistory({
    caseId: document.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'JADE_ASSIST',
    documentVersion: document.version,
    metadata: { jadeAction: body.action, factsCheckOk: result.factsCheck.ok },
  })

  return NextResponse.json({ text: result.text, factsCheck: result.factsCheck })
}
