import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    baseSalary, currency, payDay,
    bankName, accountNumber,
    allowances, deductions,
    location, department,
  } = body

  const updated = await prisma.staffMember.update({
    where: { id: params.id },
    data: {
      baseSalary:    Number(baseSalary),
      currency,
      payDay:        Number(payDay),
      bankName:      bankName || null,
      accountNumber: accountNumber || null,
      location:      location || '',
      department:    department || 'Operations',
    },
  })

  // Upsert current-month payslip so payslip list reflects updated salary
  const now          = new Date()
  const month        = now.getMonth() + 1
  const year         = now.getFullYear()
  const allowanceAmt = Number(allowances ?? 0)
  const deductionAmt = Number(deductions ?? 0)
  const grossPay     = Number(baseSalary) + allowanceAmt
  const netPay       = grossPay - deductionAmt

  await prisma.payslip.upsert({
    where: { staffMemberId_month_year: { staffMemberId: params.id, month, year } },
    update: {
      baseSalary:     Number(baseSalary),
      allowance:      allowanceAmt,
      otherDeduction: deductionAmt,
      grossPay,
      netPay,
      currency,
    },
    create: {
      staffMemberId:  params.id,
      month,
      year,
      baseSalary:     Number(baseSalary),
      allowance:      allowanceAmt,
      otherDeduction: deductionAmt,
      grossPay,
      netPay,
      currency,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ success: true, staff: updated })
  } catch (err: any) {
    console.error('[payroll/staff PATCH]', err.message)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
