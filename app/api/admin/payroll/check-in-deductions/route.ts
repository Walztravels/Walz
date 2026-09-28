// GET /api/admin/payroll/check-in-deductions?staffMemberId=&month=&year=
//
// Read-only bridge from the Check-In V2 deduction ledger (CheckInDeduction,
// keyed to the check-in system's `Staff` identity) into the Payroll system
// (StaffMember/Payslip, a separate identity keyed by email — see mission
// brief §7 audit finding: payroll and the check-in system are NOT the same
// identity table in this codebase; the join key is email).
//
// This endpoint NEVER writes to Payslip itself — it only tells the admin
// generating a payslip what the REAL, unwaived missed-check-in deductions
// for that staff member/period currently total, split by currency, so the
// existing "Generate Payslip" form (which already has editable
// attendanceDeduction/missedCheckIns fields) can be prefilled with a real
// number instead of requiring the admin to remember/estimate it. Applying
// it to an actual Payslip (and stamping it so it can never be counted
// twice) happens in /api/admin/payroll/generate, not here.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffMemberId = searchParams.get('staffMemberId')
  const month = Number(searchParams.get('month'))
  const year  = Number(searchParams.get('year'))

  if (!staffMemberId || !month || !year) {
    return NextResponse.json({ error: 'staffMemberId, month, and year are required' }, { status: 400 })
  }

  const staffMember = await prisma.staffMember.findUnique({ where: { id: staffMemberId }, select: { email: true, currency: true } })
  if (!staffMember) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  // Identity bridge: match the payroll StaffMember to the check-in Staff
  // record by email (the only reliable link between the two tables today —
  // there is no FK between them).
  const staff = await prisma.staff.findUnique({ where: { email: staffMember.email }, select: { id: true } })
  if (!staff) {
    return NextResponse.json({ staffId: null, count: 0, amount: 0, currency: staffMember.currency, unmatched: true })
  }

  const period = `${year}-${String(month).padStart(2, '0')}`
  const rows = await (prisma as any).checkInDeduction.findMany({
    where: { staffId: staff.id, status: 'ACTIVE', effectivePayrollPeriod: period, appliedToPayslipId: null },
    select: { amount: true, currency: true },
  })

  const totalsByCurrency: Record<string, { amount: number; count: number }> = {}
  for (const r of rows as { amount: number; currency: string }[]) {
    const entry = totalsByCurrency[r.currency] ?? { amount: 0, count: 0 }
    entry.amount += r.amount
    entry.count  += 1
    totalsByCurrency[r.currency] = entry
  }

  const inStaffCurrency = totalsByCurrency[staffMember.currency] ?? { amount: 0, count: 0 }

  return NextResponse.json({
    staffId: staff.id,
    period,
    payrollCurrency: staffMember.currency,
    amount: inStaffCurrency.amount,
    count:  inStaffCurrency.count,
    totalsByCurrency, // full breakdown, in case a staff member's check-in currency ever differs from their payroll currency
  })
}
