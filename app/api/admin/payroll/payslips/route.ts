import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined
  const year  = searchParams.get('year')  ? Number(searchParams.get('year'))  : undefined

  const payslips = await prisma.payslip.findMany({
    where: {
      ...(month ? { month } : {}),
      ...(year  ? { year  } : {}),
    },
    include: { staffMember: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { staffMember: { name: 'asc' } }],
  })

  return NextResponse.json({ payslips })
}
