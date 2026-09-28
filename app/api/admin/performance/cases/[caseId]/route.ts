import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

const CLOSURE_OUTCOMES = ['IMPROVED_CLOSE', 'EXTEND_MONITORING', 'CONTINUE_PIP', 'FURTHER_MANAGEMENT_REVIEW'] as const
type ClosureOutcome = (typeof CLOSURE_OUTCOMES)[number]

const STATUS_FOR_CLOSURE: Record<ClosureOutcome, string> = {
  IMPROVED_CLOSE: 'IMPROVED_CLOSED',
  EXTEND_MONITORING: 'MONITORING',
  CONTINUE_PIP: 'PIP_ACTIVE',
  FURTHER_MANAGEMENT_REVIEW: 'ESCALATED',
}

// GET /api/admin/performance/cases/[caseId] — case detail with documents + history. Super Admin only.
export async function GET(_req: NextRequest, { params }: { params: { caseId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error

  const performanceCase = await prisma.staffPerformanceCase.findUnique({
    where: { id: params.caseId },
    include: {
      documents: { orderBy: { createdAt: 'desc' } },
      history: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  })
  if (!performanceCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  return NextResponse.json({ case: performanceCase })
}

// PATCH /api/admin/performance/cases/[caseId] — update notes/mitigating
// circumstances, OR apply a review-closure decision (mission brief §10:
// Improved-Close / Extend Monitoring / Continue PIP / Further Management
// Review). Never automatic — always an explicit body.closureOutcome from
// the calling Super Admin.
export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const existing = await prisma.staffPerformanceCase.findUnique({ where: { id: params.caseId } })
  if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    notes?: string
    mitigatingCircumstances?: string
    nextReviewDate?: string | null
    closureOutcome?: string
  }

  const data: Record<string, unknown> = {}
  if (body.notes !== undefined) data.notes = body.notes
  if (body.mitigatingCircumstances !== undefined) data.mitigatingCircumstances = body.mitigatingCircumstances
  if (body.nextReviewDate !== undefined) data.nextReviewDate = body.nextReviewDate ? new Date(body.nextReviewDate) : null

  if (body.closureOutcome) {
    if (!CLOSURE_OUTCOMES.includes(body.closureOutcome as ClosureOutcome)) {
      return NextResponse.json({ error: 'Invalid closureOutcome' }, { status: 400 })
    }
    const outcome = body.closureOutcome as ClosureOutcome
    data.status = STATUS_FOR_CLOSURE[outcome]
    data.closureOutcome = outcome
    if (outcome === 'IMPROVED_CLOSE') {
      data.closedAt = new Date()
      data.closedByStaffId = session.staffId ?? session.id
      data.closedByName = session.name
    } else {
      data.closedAt = null
      data.closedByStaffId = null
      data.closedByName = null
    }
  }

  const updated = await prisma.staffPerformanceCase.update({ where: { id: params.caseId }, data })

  await logPerformanceHistory({
    caseId: params.caseId,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: body.closureOutcome ? (body.closureOutcome === 'IMPROVED_CLOSE' ? 'CLOSED' : 'REVIEW_COMPLETED') : 'NOTES_UPDATED',
    metadata: body.closureOutcome ? { closureOutcome: body.closureOutcome } : undefined,
  })

  return NextResponse.json({ case: updated })
}
