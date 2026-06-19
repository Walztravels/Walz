import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const riskBand = searchParams.get('riskBand')

  const where: Record<string, string> = {}
  if (userId) where.userId = userId
  if (riskBand) where.riskBand = riskBand

  const scores = await prisma.clientRiskScore.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ scores })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()

  const [visaApplications, portalPayments, portalApplications] = await Promise.all([
    prisma.visaApplication.findMany({ where: { userId } }),
    prisma.portalPayment.findMany({ where: { userId } }),
    prisma.portalApplication.findMany({ where: { userId } }),
  ])

  const visaApps = visaApplications.length
  const successVisa = visaApplications.filter(
    (a) => a.status === 'approved'
  ).length

  const payments = portalPayments.length
  const successPayments = portalPayments.filter(
    (p) => p.status === 'completed' || p.status === 'succeeded'
  ).length

  const applicationQuality = 50 + Math.random() * 10
  const documentReliability = 50 + Math.random() * 30
  const paymentReliability =
    payments > 0 ? Math.min(100, 60 + (successPayments / payments) * 40) : 50
  const communicationScore = 60 + Math.random() * 30
  const visaSuccessRate = visaApps > 0 ? (successVisa / visaApps) * 100 : 50

  const overallScore =
    applicationQuality * 0.3 +
    documentReliability * 0.25 +
    paymentReliability * 0.2 +
    communicationScore * 0.15 +
    visaSuccessRate * 0.1

  const riskBand =
    overallScore >= 80
      ? 'green'
      : overallScore >= 60
      ? 'yellow'
      : overallScore >= 40
      ? 'orange'
      : 'red'

  const score = await prisma.clientRiskScore.upsert({
    where: { userId },
    update: {
      applicationQuality,
      documentReliability,
      paymentReliability,
      communicationScore,
      visaSuccessRate,
      overallScore,
      riskBand,
      updatedAt: new Date(),
    },
    create: {
      userId,
      applicationQuality,
      documentReliability,
      paymentReliability,
      communicationScore,
      visaSuccessRate,
      overallScore,
      riskBand,
    },
  })

  return NextResponse.json({ score })
}
