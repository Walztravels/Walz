/**
 * Staff Performance Management — the review queue (mission brief §2).
 *
 * Builds the list purely from authoritative data (Staff + Booking via
 * lib/performance/sales.ts + existing StaffPerformanceCase rows). Never
 * creates, modifies, or infers a case — read-only.
 */

import prisma from '@/lib/db'
import { computeStaffSalesSummaries, type StaffSalesSummary } from './sales'
import { evaluateQueueEligibility, classifySalesSignal, type PerformanceSignal, type QueueEligibility } from './roles'

export type QueueFilter =
  | 'ALL'
  | '30'
  | '60'
  | '90'
  | '120'
  | 'UNDER_REVIEW'
  | 'PIP_ACTIVE'
  | 'IMPROVED'
  | 'FOLLOW_UP_DUE'

export interface QueueRow {
  staffId: string
  name: string
  email: string
  role: string
  department: string
  isActive: boolean
  sales: StaffSalesSummary
  signal: PerformanceSignal
  eligibility: QueueEligibility
  currentCaseId: string | null
  currentCaseStatus: string | null
  nextReviewDate: string | null
  previousActionsCount: number
}

const ACTIVE_CASE_STATUSES = new Set(['OPEN', 'MONITORING', 'COACHING', 'PIP_ACTIVE', 'REVIEW_DUE', 'EXTENDED', 'ESCALATED'])

export async function buildPerformanceQueue(filter: QueueFilter, now: Date = new Date()): Promise<QueueRow[]> {
  const [staffList, allCases, docCounts] = await Promise.all([
    prisma.staff.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        isActive: true,
        hireDate: true,
        performanceReviewExempt: true,
        performanceReviewExemptReason: true,
        performanceReviewExemptUntil: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.staffPerformanceCase.findMany({
      select: { id: true, staffId: true, status: true, nextReviewDate: true, openedAt: true },
      orderBy: { openedAt: 'desc' },
    }),
    prisma.staffPerformanceDocument.groupBy({
      by: ['staffId'],
      where: { status: { in: ['ISSUED', 'ACKNOWLEDGED'] } },
      _count: { _all: true },
    }),
  ])

  // Latest case per staff.
  const latestCaseByStaff = new Map<string, (typeof allCases)[number]>()
  for (const c of allCases) {
    if (!latestCaseByStaff.has(c.staffId)) latestCaseByStaff.set(c.staffId, c)
  }
  const previousActionsByStaff = new Map(docCounts.map((d) => [d.staffId, d._count._all]))

  const salesMap = await computeStaffSalesSummaries(staffList.map((s) => s.id), now)

  const rows: QueueRow[] = staffList.map((staff) => {
    const sales = salesMap.get(staff.id)!
    const eligibility = evaluateQueueEligibility(staff, now)
    const currentCase = latestCaseByStaff.get(staff.id) ?? null
    return {
      staffId: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      department: staff.department,
      isActive: staff.isActive,
      sales,
      signal: eligibility.eligible ? classifySalesSignal(sales.daysSinceLastSale) : 'NONE',
      eligibility,
      currentCaseId: currentCase?.id ?? null,
      currentCaseStatus: currentCase?.status ?? null,
      nextReviewDate: currentCase?.nextReviewDate?.toISOString() ?? null,
      previousActionsCount: previousActionsByStaff.get(staff.id) ?? 0,
    }
  })

  const inSevenDays = new Date(now.getTime() + 7 * 86_400_000)

  return rows.filter((r) => {
    switch (filter) {
      case 'ALL':
        // Every eligible staff member, PLUS any staff with an existing
        // case (so a case is never hidden just because a role/status
        // changed after it was opened).
        return r.eligibility.eligible || r.currentCaseId
      case '30':
        return r.eligibility.eligible && r.sales.daysSinceLastSale != null && r.sales.daysSinceLastSale >= 30
      case '60':
        return r.eligibility.eligible && r.sales.daysSinceLastSale != null && r.sales.daysSinceLastSale >= 60
      case '90':
        return r.eligibility.eligible && r.sales.daysSinceLastSale != null && r.sales.daysSinceLastSale >= 90
      case '120':
        return r.eligibility.eligible && r.sales.daysSinceLastSale != null && r.sales.daysSinceLastSale >= 120
      case 'UNDER_REVIEW':
        return r.currentCaseStatus != null && ['OPEN', 'MONITORING', 'COACHING'].includes(r.currentCaseStatus)
      case 'PIP_ACTIVE':
        return r.currentCaseStatus === 'PIP_ACTIVE'
      case 'IMPROVED':
        return r.currentCaseStatus === 'IMPROVED_CLOSED'
      case 'FOLLOW_UP_DUE':
        return (
          r.currentCaseStatus != null &&
          ACTIVE_CASE_STATUSES.has(r.currentCaseStatus) &&
          r.nextReviewDate != null &&
          new Date(r.nextReviewDate) <= inSevenDays
        )
      default:
        return true
    }
  })
}
