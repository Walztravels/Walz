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
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, email, role, location, department, currency, baseSalary, payDay, bankName, accountNumber } = body

    if (!name || !email || !baseSalary) {
      return NextResponse.json({ error: 'Name, email and base salary are required' }, { status: 400 })
    }

    const member = await prisma.staffMember.upsert({
      where: { email },
      update: { name, role: role || 'Staff', location: location || '', department: department || 'Operations', currency: currency || 'NGN', baseSalary: Number(baseSalary), payDay: Number(payDay ?? 28), bankName: bankName || null, accountNumber: accountNumber || null },
      create: { name, email, role: role || 'Staff', location: location || '', department: department ?? 'Operations', currency: currency ?? 'NGN', baseSalary: Number(baseSalary), payDay: Number(payDay ?? 28), bankName: bankName || null, accountNumber: accountNumber || null },
    })

    return NextResponse.json({ member })
  } catch (err: any) {
    console.error('[payroll/staff POST]', err.message, err.stack)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
