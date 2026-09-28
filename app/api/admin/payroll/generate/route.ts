import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Check-In V2 integration (mission brief §7): once a payslip has been
  // generated for this staff member/period, stamp every currently-unclaimed
  // ACTIVE missed-check-in deduction for that same period as "applied to
  // this payslip" so it can never be suggested or counted again in a later
  // payroll run for this or any other period. This does NOT change the
  // admin-entered attendanceDeduction number above — it only prevents the
  // real ledger from being double-counted. The admin sees the real,
  // unclaimed total via GET /api/admin/payroll/check-in-deductions before
  // generating, and is expected to have used it (or a deliberate override)
  // when filling attendanceDeduction.
  try {
    const staffLink = await prisma.staff.findUnique({ where: { email: staff.email }, select: { id: true } })
    if (staffLink) {
      const period = `${year}-${String(month).padStart(2, '0')}`
      await (prisma as any).checkInDeduction.updateMany({
        where: { staffId: staffLink.id, status: 'ACTIVE', effectivePayrollPeriod: period, appliedToPayslipId: null },
        data:  { appliedToPayslipId: payslip.id, appliedAt: new Date() },
      })
    }
  } catch (e) {
    // Non-fatal — the payslip itself is the authoritative record; failing to
    // stamp the ledger only means it may be re-suggested next time, never a
    // silent financial loss.
    console.warn('[payroll/generate] check-in deduction stamping failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ payslip })
}
