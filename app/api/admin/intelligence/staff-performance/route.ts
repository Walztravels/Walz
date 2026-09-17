import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { computeStaffMetrics } from '@/lib/intelligence/staff-metrics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staffId')
  const period = searchParams.get('period')
  const burnoutFlag = searchParams.get('burnoutFlag')

  const where: Record<string, unknown> = {}
  if (staffId) where.staffId = staffId
  if (period) where.period = period
  if (burnoutFlag === 'true') where.burnoutFlag = true

  const metrics = await prisma.staffPerformanceMetric.findMany({ where })

  return NextResponse.json({ metrics })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, period } = await req.json()
  if (!staffId || !/^\d{4}-\d{2}$/.test(String(period ?? ''))) {
    return NextResponse.json({ error: 'staffId and period (YYYY-MM) are required' }, { status: 400 })
  }

  // INT-8: the 13 hardcoded constants are gone. Every metric is computed
  // from actual operational records with its source named; anything
  // without a data source is 0 and listed in notComputable — never
  // invented. Burnout is NOT diagnosed: burnoutRisk carries the
  // observable WORKLOAD INDICATOR and burnoutFlag stays false.
  try {
    const payload = await computeStaffMetrics(String(staffId), String(period))
    if (!payload) return NextResponse.json({ error: 'Staff member not found (or invalid period).' }, { status: 404 })

    const m = payload.metrics
    // totalRevenue holds the LARGEST single-currency bucket (never summed
    // across currencies); the full breakdown lives in skillsGaps JSON.
    const buckets = Object.entries(payload.revenueByCurrency).sort((a, b) => b[1] - a[1])
    const totalRevenue = buckets[0]?.[1] ?? 0

    const values = {
      applicationsHandled: m.applicationsAssigned.value,
      leadsContacted:      m.leadsAssigned.value,
      bookingsCreated:     m.bookingsCreated.value,
      // No data source yet — zero, never invented (see notComputable).
      avgApplicationScore: 0, approvalRate: 0, docQualityScore: 0,
      avgResponseTimeMin: 0, avgCompletionDays: 0,
      totalRevenue, revenuePerHour: 0, crossSellRate: 0,
      burnoutFlag: false,
      burnoutRisk: payload.workloadIndicator.value,   // workload indicator, not a diagnosis
      skillsGaps: payload as never,                   // the real attributed payload
      coachingBrief: null,
      updatedAt: new Date(),
    }
    const metric = await prisma.staffPerformanceMetric.upsert({
      where: { staffId_period: { staffId: String(staffId), period: String(period) } },
      update: values,
      create: { staffId: String(staffId), period: String(period), ...values },
    })

    return NextResponse.json({ metric, payload })
  } catch (e) {
    console.error('[staff-performance]', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ error: 'Metric computation failed. Please try again.' }, { status: 500 })
  }
}
