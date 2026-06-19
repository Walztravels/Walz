import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

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

  const applicationsHandled = 0
  const leadsContacted = 0
  const bookingsCreated = 0
  const avgApplicationScore = 70
  const approvalRate = 0.75
  const docQualityScore = 80
  const avgResponseTimeMin = 45
  const avgCompletionDays = 14
  const totalRevenue = 0
  const revenuePerHour = 0
  const crossSellRate = 0.2
  const burnoutFlag = false
  const burnoutRisk = 25

  const metric = await prisma.staffPerformanceMetric.upsert({
    where: { staffId_period: { staffId, period } },
    update: {
      applicationsHandled,
      leadsContacted,
      bookingsCreated,
      avgApplicationScore,
      approvalRate,
      docQualityScore,
      avgResponseTimeMin,
      avgCompletionDays,
      totalRevenue,
      revenuePerHour,
      crossSellRate,
      burnoutFlag,
      burnoutRisk,
      updatedAt: new Date(),
    },
    create: {
      staffId,
      period,
      applicationsHandled,
      leadsContacted,
      bookingsCreated,
      avgApplicationScore,
      approvalRate,
      docQualityScore,
      avgResponseTimeMin,
      avgCompletionDays,
      totalRevenue,
      revenuePerHour,
      crossSellRate,
      burnoutFlag,
      burnoutRisk,
    },
  })

  return NextResponse.json({ metric })
}
