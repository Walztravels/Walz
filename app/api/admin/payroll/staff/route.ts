import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const staff = await prisma.staffMember.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        payslips: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 1,
        },
      },
    })

    return NextResponse.json({ staff })
  } catch (err: any) {
    console.error('[payroll/staff GET]', err.message, err.stack)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, role, location, department, currency, baseSalary, payDay, bankName, accountNumber } = body

  if (!name || !email || !role || !location || !baseSalary) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const member = await prisma.staffMember.upsert({
    where: { email },
    update: { name, role, location, department, currency, baseSalary, payDay, bankName, accountNumber },
    create: { name, email, role, location, department: department ?? 'Operations', currency: currency ?? 'NGN', baseSalary, payDay: payDay ?? 28, bankName, accountNumber },
  })

  return NextResponse.json({ member })
}
