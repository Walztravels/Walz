import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const passportCountry = searchParams.get('passportCountry')
  const destinationIso2 = searchParams.get('destinationIso2')

  const where: Record<string, string> = {}
  if (passportCountry) where.passportCountry = passportCountry
  if (destinationIso2) where.destinationIso2 = destinationIso2

  const intelligence = await prisma.diasporaIntelligence.findMany({
    where,
    orderBy: { totalApplications: 'desc' },
  })

  return NextResponse.json({ intelligence })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    passportCountry,
    destinationIso2,
    bankName,
    outcome,
  }: {
    passportCountry: string
    destinationIso2: string
    bankName?: string
    outcome: 'approved' | 'refused'
  } = await req.json()

  const uniqueWhere = { passportCountry_destinationIso2_bankName: { passportCountry, destinationIso2, bankName: bankName ?? '' } }

  const existing = await prisma.diasporaIntelligence.findUnique({ where: uniqueWhere })

  const currentApprovals = existing?.approvals ?? 0
  const currentRefusals = existing?.refusals ?? 0
  const currentTotal = existing?.totalApplications ?? 0

  const newApprovals = outcome === 'approved' ? currentApprovals + 1 : currentApprovals
  const newRefusals = outcome === 'refused' ? currentRefusals + 1 : currentRefusals
  const newTotal = currentTotal + 1
  const approvalRate = newApprovals / newTotal

  const record = await prisma.diasporaIntelligence.upsert({
    where: uniqueWhere,
    update: {
      totalApplications: newTotal,
      approvals: newApprovals,
      refusals: newRefusals,
      approvalRate,
    },
    create: {
      passportCountry,
      destinationIso2,
      bankName: bankName ?? '',
      totalApplications: newTotal,
      approvals: newApprovals,
      refusals: newRefusals,
      approvalRate,
    },
  })

  return NextResponse.json({ record })
}
