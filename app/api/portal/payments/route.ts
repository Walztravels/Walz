import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const applicationId = searchParams.get('applicationId')

  const payments = await prisma.portalPayment.findMany({
    where: { userId: user.id, ...(applicationId ? { applicationId } : {}) },
    include: { application: { select: { title: true, refNumber: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const totalPaid = payments
    .filter(p => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0)

  return NextResponse.json({ payments, totalPaid })
}
