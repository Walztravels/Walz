import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/resend'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtNum(n: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function buildAdviceHtml(p: {
  name: string; monthName: string; year: number; payDay: number; currency: string
  baseSalary: number; allowance: number; deductions: number; grossPay: number; netPay: number
  bankName: string | null; accountNumber: string | null
}) {
  const f = (n: number) => fmtNum(n, p.currency)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Salary Advice — ${p.monthName} ${p.year}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#060f1e;padding:30px 36px;">
    <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Walz Travels</p>
    <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Salary Advice — ${p.monthName} ${p.year}</h1>
  </td></tr>
  <tr><td style="padding:28px 36px;">
    <p style="color:#374151;font-size:15px;margin:0 0 16px;">
      Dear <strong>${p.name}</strong>,
    </p>
    <p style="color:#555;font-size:14px;margin:0 0 20px;line-height:1.6;">
      Your salary for <strong>${p.monthName} ${p.year}</strong> is scheduled for payment on the
      <strong>${p.payDay}${p.payDay === 1 ? 'st' : p.payDay === 2 ? 'nd' : p.payDay === 3 ? 'rd' : 'th'}</strong>.
      Please review the details below and contact us before then if anything looks incorrect.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;">
      <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Basic Salary</td>
          <td align="right" style="padding:10px 0;font-weight:600;color:#111827;font-size:14px;border-bottom:1px solid #f3f4f6;">${f(p.baseSalary)}</td></tr>
      ${p.allowance > 0 ? `
      <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Allowances</td>
          <td align="right" style="padding:10px 0;font-weight:600;color:#16a34a;font-size:14px;border-bottom:1px solid #f3f4f6;">+ ${f(p.allowance)}</td></tr>` : ''}
      ${p.deductions > 0 ? `
      <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Deductions</td>
          <td align="right" style="padding:10px 0;font-weight:600;color:#dc2626;font-size:14px;border-bottom:1px solid #f3f4f6;">− ${f(p.deductions)}</td></tr>` : ''}
      <tr style="background:#FEF3C7;"><td style="padding:14px 12px;font-weight:700;color:#92400E;font-size:16px;border-radius:8px 0 0 8px;">NET PAY</td>
          <td align="right" style="padding:14px 12px;font-weight:800;color:#92400E;font-size:18px;border-radius:0 8px 8px 0;">${f(p.netPay)}</td></tr>
    </table>
    <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-weight:700;color:#111827;font-size:13px;">Payment Details</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">Bank: <strong style="color:#111827;">${p.bankName || 'N/A'}</strong></p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Account: <strong style="color:#111827;">****${(p.accountNumber || '').slice(-4) || 'N/A'}</strong></p>
    </div>
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        📋 If you notice any discrepancies, please contact your administrator
        <strong>before the ${p.payDay}th</strong>. If everything looks correct, no action is needed.
      </p>
    </div>
  </td></tr>
  <tr><td style="background:#060f1e;padding:16px 36px;text-align:center;">
    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">Walz Travels HR Department · This is an automated salary notification.</p>
  </td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId } = await req.json()
  if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })

  const staff = await prisma.staffMember.findUnique({ where: { id: staffId } })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const now     = new Date()
  const month   = now.getMonth() + 1
  const year    = now.getFullYear()

  const payslip = await prisma.payslip.findFirst({
    where: { staffMemberId: staffId, month, year },
  })

  const allowance  = payslip?.allowance      ?? 0
  const deductions = payslip?.otherDeduction ?? 0
  const grossPay   = staff.baseSalary + allowance
  const netPay     = grossPay - deductions

  const html = buildAdviceHtml({
    name:         staff.name,
    monthName:    MONTHS[month - 1],
    year,
    payDay:       staff.payDay,
    currency:     staff.currency,
    baseSalary:   staff.baseSalary,
    allowance,
    deductions,
    grossPay,
    netPay,
    bankName:     staff.bankName,
    accountNumber: staff.accountNumber,
  })

    await getResend().emails.send({
    from:    'Walz Travels HR <hr@walztravels.com>',
    to:      staff.email,
    subject: `Salary Advice — ${MONTHS[month - 1]} ${year}`,
    html,
  })

  return NextResponse.json({ success: true, message: `Salary advice sent to ${staff.email}` })
}
