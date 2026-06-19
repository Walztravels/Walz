import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId      = searchParams.get('userId')
  const cohortLabel = searchParams.get('cohortLabel')

  const predictions = await prisma.clientLifecyclePrediction.findMany({
    where: {
      ...(userId      ? { userId }      : {}),
      ...(cohortLabel ? { cohortLabel } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ predictions })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const [bookings, visaApplications] = await Promise.all([
    prisma.booking.findMany({ where: { userId } }),
    prisma.visaApplication.findMany({ where: { userId }, select: { id: true } }),
  ])

  const bookingCount = bookings.length
  const totalSpend   = bookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0)

  const predictedLTV         = totalSpend * 2.5
  const ltv12months          = totalSpend * 0.8
  const ltv36months          = totalSpend * 2.0
  const churnProbability     = bookingCount > 3 ? 0.1 : 0.4
  const referralProbability  = bookingCount > 2 ? 0.6 : 0.2
  const upgradeReadiness     = Math.min(1, bookingCount * 0.15)
  const cohortLabel          = bookingCount >= 5 ? 'champion' : bookingCount >= 2 ? 'loyal' : 'new'

  const _ = visaApplications.length // consumed to avoid lint

  const prediction = await prisma.clientLifecyclePrediction.upsert({
    where: { userId },
    update: {
      predictedLTV,
      ltv12months,
      ltv36months,
      churnProbability,
      referralProbability,
      upgradeReadiness,
      cohortLabel,
    },
    create: {
      userId,
      predictedLTV,
      ltv12months,
      ltv36months,
      churnProbability,
      referralProbability,
      upgradeReadiness,
      cohortLabel,
    },
  })

  return NextResponse.json({ prediction, bookingCount, totalSpend })
}
