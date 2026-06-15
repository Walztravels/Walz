import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { staffMemberId, month, year, bonus = 0, allowance = 0, attendanceDeduction = 0, otherDeduction = 0, deductionNote = '', missedCheckIns = 0 } = body

  if (!staffMemberId || !month || !year) {
    return NextResponse.json({ error: 'staffMemberId, month, and year are required' }, { status: 400 })
  }

  const staff = await prisma.staffMember.findUnique({ where: { id: staffMemberId } })
  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const grossPay = staff.baseSalary + bonus + allowance
  const netPay   = grossPay - attendanceDeduction - otherDeduction

  const payslip = await prisma.payslip.upsert({
    where: { staffMemberId_month_year: { staffMemberId, month, year } },
    update: { baseSalary: staff.baseSalary, bonus, allowance, attendanceDeduction, otherDeduction, deductionNote, grossPay, netPay, currency: staff.currency, missedCheckIns, status: 'PENDING', emailSentAt: null, paidAt: null },
    create: { staffMemberId, month, year, baseSalary: staff.baseSalary, bonus, allowance, attendanceDeduction, otherDeduction, deductionNote, grossPay, netPay, currency: staff.currency, missedCheckIns, status: 'PENDING' },
  })

  return NextResponse.json({ payslip })
}
