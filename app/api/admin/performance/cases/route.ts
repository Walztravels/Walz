import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { computeStaffSalesSummary } from '@/lib/performance/sales'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

const MANAGEMENT_ACTIONS = [
  'NO_ACTION',
  'MONITOR',
  'COACHING_REQUIRED',
  'PIP_STARTED',
  'FIRST_WARNING_ISSUED',
  'FINAL_WARNING_ISSUED',
] as const
type ManagementAction = (typeof MANAGEMENT_ACTIONS)[number]

const STATUS_FOR_ACTION: Record<ManagementAction, string> = {
  NO_ACTION: 'CLOSED',
  MONITOR: 'MONITORING',
  COACHING_REQUIRED: 'COACHING',
  PIP_STARTED: 'PIP_ACTIVE',
  FIRST_WARNING_ISSUED: 'OPEN',
  FINAL_WARNING_ISSUED: 'OPEN',
}

// POST /api/admin/performance/cases — open a STAFF PERFORMANCE REVIEW
// (mission brief §4/§5). This is the ONLY way a case is ever created —
// there is no cron/automatic path. The management action is always an
// explicit choice made by the calling Super Admin (never AI-selected).
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const body = await req.json().catch(() => ({})) as {
    staffId?: string
    managementAction?: string
    reviewPeriodStart?: string
    reviewPeriodEnd?: string
    notes?: string
    mitigatingCircumstances?: string
    nextReviewDate?: string
  }

  if (!body.staffId || !body.managementAction || !MANAGEMENT_ACTIONS.includes(body.managementAction as ManagementAction)) {
    return NextResponse.json({ error: 'staffId and a valid managementAction are required' }, { status: 400 })
  }
  if (!body.reviewPeriodStart || !body.reviewPeriodEnd) {
    return NextResponse.json({ error: 'reviewPeriodStart and reviewPeriodEnd are required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: body.staffId } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const action = body.managementAction as ManagementAction
  const now = new Date()
  const sales = await computeStaffSalesSummary(staff.id, now)

  const status = STATUS_FOR_ACTION[action]
  const nextReviewDate = body.nextReviewDate ? new Date(body.nextReviewDate) : null

  const performanceCase = await prisma.staffPerformanceCase.create({
    data: {
      staffId: staff.id,
      status,
      openedByStaffId: session.staffId ?? session.id,
      openedByName: session.name,
      reviewPeriodStart: new Date(body.reviewPeriodStart),
      reviewPeriodEnd: new Date(body.reviewPeriodEnd),
      daysSinceLastSaleAtOpen: sales.daysSinceLastSale ?? -1,
      lastCompletedSaleAtOpen: sales.lastCompletedSaleAt,
      salesInPeriodAtOpen: sales.salesLast120,
      recommendedAction: action,
      managementAction: action,
      notes: body.notes ?? null,
      mitigatingCircumstances: body.mitigatingCircumstances ?? null,
      nextReviewDate,
      closedAt: status === 'CLOSED' ? now : null,
      closedByStaffId: status === 'CLOSED' ? (session.staffId ?? session.id) : null,
      closedByName: status === 'CLOSED' ? session.name : null,
      closureOutcome: status === 'CLOSED' ? 'NO_ACTION' : null,
    },
  })

  await logPerformanceHistory({
    caseId: performanceCase.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'CASE_OPENED',
    metadata: { managementAction: action, staffId: staff.id },
  })

  return NextResponse.json({ case: performanceCase }, { status: 201 })
}
