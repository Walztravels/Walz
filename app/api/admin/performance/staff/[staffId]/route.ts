import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { computeStaffSalesSummary, computeStaffActivityEvidence } from '@/lib/performance/sales'
import { evaluateQueueEligibility, classifySalesSignal } from '@/lib/performance/roles'

export const dynamic = 'force-dynamic'

// GET /api/admin/performance/staff/[staffId] — the full STAFF PERFORMANCE
// REVIEW evidence bundle (mission brief §4, sections A-E). Super Admin only.
// IDOR note: staffId comes from the URL but every downstream query is
// scoped to that exact id — there is no code path that can return a
// different staff member's data from this id.
export async function GET(_req: NextRequest, { params }: { params: { staffId: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error

  const staff = await prisma.staff.findUnique({
    where: { id: params.staffId },
    select: {
      id: true,
      name: true,
      email: true,
      roleTitle: true,
      role: true,
      department: true,
      branch: true,
      isActive: true,
      hireDate: true,
      performanceReviewExempt: true,
      performanceReviewExemptReason: true,
      performanceReviewExemptUntil: true,
    },
  })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const now = new Date()
  const periodStart = new Date(now.getTime() - 120 * 86_400_000)

  const [sales, activity, cases] = await Promise.all([
    computeStaffSalesSummary(staff.id, now),
    computeStaffActivityEvidence(staff, periodStart, now),
    prisma.staffPerformanceCase.findMany({
      where: { staffId: staff.id },
      orderBy: { openedAt: 'desc' },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            warningType: true,
            status: true,
            version: true,
            issuedByName: true,
            deliveredAt: true,
            openedAt: true,
            acknowledgedAt: true,
            employeeResponseAt: true,
            reviewDate: true,
            createdAt: true,
          },
        },
      },
    }),
  ])

  const eligibility = evaluateQueueEligibility(staff, now)
  const signal = eligibility.eligible ? classifySalesSignal(sales.daysSinceLastSale) : 'NONE'

  const previousWarnings = cases.flatMap((c) => c.documents).filter((d) => d.status === 'ISSUED' || d.status === 'ACKNOWLEDGED')

  return NextResponse.json({
    staff: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      jobTitle: staff.roleTitle,
      role: staff.role,
      department: staff.department,
      branch: staff.branch,
      isActive: staff.isActive,
      hireDate: staff.hireDate,
      performanceReviewExempt: staff.performanceReviewExempt,
      performanceReviewExemptReason: staff.performanceReviewExemptReason,
      performanceReviewExemptUntil: staff.performanceReviewExemptUntil,
    },
    eligibility,
    signal,
    sales,
    activity,
    cases,
    previousWarningsCount: previousWarnings.length,
    dataQualityNote:
      !sales.hasAnyBookingEver
        ? 'No completed sale has ever been recorded for this staff member. This may indicate a genuine performance issue, an attribution gap in historical records, or that this staff member does not carry direct sales responsibility for the products captured in Bookings. Verify manually before taking action.'
        : null,
  })
}
