import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) return NextResponse.json({ applications: [] })

  const applications = await prisma.visaApplication.findMany({
    where: {
      OR: [
        { referenceNumber: { contains: q, mode: 'insensitive' } },
        { firstName:       { contains: q, mode: 'insensitive' } },
        { lastName:        { contains: q, mode: 'insensitive' } },
        { destinationIso2: { contains: q, mode: 'insensitive' } },
        { email:           { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id:              true,
      referenceNumber: true,
      firstName:       true,
      lastName:        true,
      destinationIso2: true,
      status:          true,
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })

  return NextResponse.json({ applications })
}
