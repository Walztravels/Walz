import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const records = await prisma.clientFinancialDNA.findMany({
    where: userId ? { userId } : {},
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ records })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Pull all visa applications for this user
  const applications = await prisma.visaApplication.findMany({
    where: { userId },
    select: { status: true, createdAt: true },
  })

  const analysisCount = applications.length
  const successCount  = applications.filter(a => a.status === 'approved').length
  const provenTraveller = successCount > 0

  // Placeholder scores derived from application history
  const averageScore = analysisCount > 0 ? 50 + (successCount / analysisCount) * 40 : 0
  const peakScore    = averageScore > 0 ? Math.min(100, averageScore + 10) : 0
  const lowestScore  = averageScore > 0 ? Math.max(0,   averageScore - 15) : 0
  const scoreDelta   = 0
  const latestStatus = applications.length > 0
    ? applications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].status
    : 'unknown'

  const record = await prisma.clientFinancialDNA.upsert({
    where: { userId },
    update: {
      analysisCount,
      averageScore,
      peakScore,
      lowestScore,
      latestStatus,
      scoreDelta,
      provenTraveller,
      successCount,
    },
    create: {
      userId,
      analysisCount,
      averageScore,
      peakScore,
      lowestScore,
      latestStatus,
      scoreDelta,
      provenTraveller,
      successCount,
    },
  })

  return NextResponse.json({ record })
}
