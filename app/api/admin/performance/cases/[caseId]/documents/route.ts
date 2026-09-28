import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { computeStaffSalesSummary, computeSalesInPeriod } from '@/lib/performance/sales'
import { buildWarningDraft, type WarningType } from '@/lib/performance/template'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'

const WARNING_TYPES: WarningType[] = [
  'COACHING_NOTE',
  'FIRST_WRITTEN_WARNING',
  'FINAL_WARNING',
  'PERFORMANCE_IMPROVEMENT_PLAN',
]

// POST /api/admin/performance/cases/[caseId]/documents — GENERATE WARNING
// (mission brief §5). Creates a DRAFT document with facts pre-populated
// from authoritative records. Never sends anything, never notifies the
// employee — that only happens via the separate Approve & Issue endpoint.
export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const performanceCase = await prisma.staffPerformanceCase.findUnique({ where: { id: params.caseId } })
  if (!performanceCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    warningType?: string
    requiredImprovement?: string
    pipDurationDays?: number
    reviewDate?: string
    additionalNotes?: string
  }

  if (!body.warningType || !WARNING_TYPES.includes(body.warningType as WarningType)) {
    return NextResponse.json({ error: 'A valid warningType is required' }, { status: 400 })
  }
  if (!body.requiredImprovement?.trim()) {
    return NextResponse.json({ error: 'requiredImprovement is required' }, { status: 400 })
  }
  if (!body.reviewDate) {
    return NextResponse.json({ error: 'reviewDate is required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({ where: { id: performanceCase.staffId } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const warningType = body.warningType as WarningType
  const [sales, salesInReviewPeriod, priorDocs] = await Promise.all([
    computeStaffSalesSummary(staff.id),
    computeSalesInPeriod(staff.id, performanceCase.reviewPeriodStart, performanceCase.reviewPeriodEnd),
    prisma.staffPerformanceDocument.findMany({
      where: { staffId: staff.id, status: { in: ['ISSUED', 'ACKNOWLEDGED'] } },
      orderBy: { createdAt: 'desc' },
      select: { warningType: true, createdAt: true },
    }),
  ])

  const warningHistorySummary = priorDocs.length
    ? `This is not the first performance action for this staff member. Prior records show: ${priorDocs
        .map((d) => `${d.warningType.replace(/_/g, ' ').toLowerCase()} (${d.createdAt.toDateString()})`)
        .join('; ')}.`
    : 'No prior formal performance warning has been recorded for this staff member.'

  const nextVersion = (await prisma.staffPerformanceDocument.count({ where: { caseId: params.caseId } })) + 1

  const draftContent = buildWarningDraft({
    employeeName: staff.name,
    jobTitle: staff.roleTitle,
    department: staff.department,
    warningType,
    reviewPeriodStart: performanceCase.reviewPeriodStart,
    reviewPeriodEnd: performanceCase.reviewPeriodEnd,
    salesInPeriod: salesInReviewPeriod,
    lastSaleDate: sales.lastCompletedSaleAt,
    requiredImprovement: body.requiredImprovement,
    pipDurationDays: body.pipDurationDays ?? null,
    reviewDate: new Date(body.reviewDate),
    issuedByName: session.name,
    warningHistorySummary,
    additionalNotes: body.additionalNotes ?? null,
  })

  const document = await prisma.staffPerformanceDocument.create({
    data: {
      caseId: params.caseId,
      staffId: staff.id,
      version: nextVersion,
      warningType,
      status: 'DRAFT',
      employeeNameSnapshot: staff.name,
      jobTitleSnapshot: staff.roleTitle,
      departmentSnapshot: staff.department,
      reviewPeriodStart: performanceCase.reviewPeriodStart,
      reviewPeriodEnd: performanceCase.reviewPeriodEnd,
      salesInPeriod: salesInReviewPeriod,
      lastSaleDate: sales.lastCompletedSaleAt,
      warningHistorySummary,
      requiredImprovement: body.requiredImprovement,
      pipDurationDays: body.pipDurationDays ?? null,
      reviewDate: new Date(body.reviewDate),
      additionalNotes: body.additionalNotes ?? null,
      draftContent,
    },
  })

  await logPerformanceHistory({
    caseId: params.caseId,
    documentId: document.id,
    actorStaffId: session.staffId ?? session.id,
    actorName: session.name,
    action: 'DRAFTED',
    documentVersion: document.version,
    metadata: { warningType },
  })

  return NextResponse.json({ document }, { status: 201 })
}
