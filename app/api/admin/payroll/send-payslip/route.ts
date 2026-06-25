import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const resend = new Resend(process.env.RESEND_API_KEY)

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function payslipHtml(params: {
  name: string; month: number; year: number; currency: string; payslipRef: string
  baseSalary: number; bonus: number; allowance: number
  attendanceDeduction: number; otherDeduction: number; deductionNote: string | null
  grossPay: number; netPay: number; missedCheckIns: number
  bankName: string | null; accountNumber: string | null
}) {
  const {
    name, month, year, currency, payslipRef,
    baseSalary, bonus, allowance,
    attendanceDeduction, otherDeduction, deductionNote,
    grossPay, netPay, missedCheckIns,
    bankName, accountNumber,
  } = params
  const f = (n: number) => fmtCurrency(n, currency)
  const monthName = MONTHS[month - 1]

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payslip – ${monthName} ${year}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0B1F3A;padding:32px 36px;">
    <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Walz Travels</p>
    <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700;">Payslip — ${monthName} ${year}</h1>
    <p style="color:rgba(255,255,255,0.55);font-size:13px;margin:8px 0 0;">
      Prepared for: <strong style="color:rgba(255,255,255,0.85);">${name}</strong>
      &nbsp;·&nbsp;
      <span style="color:rgba(255,255,255,0.4);">Ref: ${payslipRef}</span>
    </p>
  </td></tr>
  <tr><td style="padding:32px 36px;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:24px;display:inline-block;">
      <span style="color:#15803d;font-weight:700;font-size:13px;">✓ PAYMENT PROCESSED</span>
      <span style="color:#16a34a;font-size:12px;margin-left:8px;">1 ${monthName} – ${new Date(year, month - 1 + 1, 0).getDate()} ${monthName} ${year}</span>
    </div>
    <h3 style="color:#0B1F3A;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;border-bottom:1px solid #e8ecf0;padding-bottom:8px;">Earnings</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Base Salary</td><td align="right" style="color:#0B1F3A;font-weight:600;font-size:14px;">${f(baseSalary)}</td></tr>
      ${bonus    > 0 ? `<tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Bonus</td><td align="right" style="color:#0B1F3A;font-weight:600;font-size:14px;">${f(bonus)}</td></tr>` : ''}
      ${allowance > 0 ? `<tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Allowance</td><td align="right" style="color:#0B1F3A;font-weight:600;font-size:14px;">${f(allowance)}</td></tr>` : ''}
      <tr style="border-top:1px solid #e8ecf0;"><td style="padding:10px 0 4px;color:#0B1F3A;font-weight:700;font-size:14px;">Gross Pay</td><td align="right" style="color:#0B1F3A;font-weight:700;font-size:16px;padding-top:10px;">${f(grossPay)}</td></tr>
    </table>
    ${(attendanceDeduction > 0 || otherDeduction > 0) ? `
    <h3 style="color:#0B1F3A;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;border-bottom:1px solid #e8ecf0;padding-bottom:8px;">Deductions</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${attendanceDeduction > 0 ? `<tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Attendance (${missedCheckIns} missed)</td><td align="right" style="color:#c0392b;font-weight:600;font-size:14px;">−${f(attendanceDeduction)}</td></tr>` : ''}
      ${otherDeduction > 0 ? `<tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">${deductionNote || 'Other'}</td><td align="right" style="color:#c0392b;font-weight:600;font-size:14px;">−${f(otherDeduction)}</td></tr>` : ''}
    </table>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1F3A;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <tr><td style="color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;">Net Pay</td><td align="right" style="color:#C9A84C;font-size:26px;font-weight:700;">${f(netPay)}</td></tr>
    </table>
    ${(bankName || accountNumber) ? `
    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-weight:700;color:#0B1F3A;font-size:13px;">Paid to</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">Bank: <strong style="color:#0B1F3A;">${bankName || 'N/A'}</strong></p>
      <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Account: <strong style="color:#0B1F3A;">****${(accountNumber || '').slice(-4) || 'N/A'}</strong></p>
    </div>` : ''}
    <p style="color:#718096;font-size:12px;margin:0;">For queries contact <a href="mailto:hr@walztravels.com" style="color:#C9A84C;">hr@walztravels.com</a>.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e8ecf0;">
    <p style="color:#a0aec0;font-size:11px;margin:0;text-align:center;">The Walz Travels Inc · Ontario, Canada · Registered in England &amp; Wales</p>
  </td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { payslipId } = await req.json()
  if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })

  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { staffMember: true },
  })
  if (!payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

  // Reference number: WTZ-YYYY-MM-NNN
  const payslipRef = `WTZ-${payslip.year}-${String(payslip.month).padStart(2,'0')}-${payslip.id.slice(-4).toUpperCase()}`

  const html = payslipHtml({
    name:                payslip.staffMember.name,
    month:               payslip.month,
    year:                payslip.year,
    currency:            payslip.currency,
    payslipRef,
    baseSalary:          payslip.baseSalary,
    bonus:               payslip.bonus,
    allowance:           payslip.allowance,
    attendanceDeduction: payslip.attendanceDeduction,
    otherDeduction:      payslip.otherDeduction,
    deductionNote:       payslip.deductionNote,
    grossPay:            payslip.grossPay,
    netPay:              payslip.netPay,
    missedCheckIns:      payslip.missedCheckIns,
    bankName:            payslip.staffMember.bankName,
    accountNumber:       payslip.staffMember.accountNumber,
  })

  await resend.emails.send({
    from:    'Walz Travels HR <hr@walztravels.com>',
    to:      payslip.staffMember.email,
    subject: `Your Payslip – ${MONTHS[payslip.month - 1]} ${payslip.year} [${payslipRef}]`,
    html,
  })

  await prisma.payslip.update({
    where: { id: payslipId },
    data:  { emailSentAt: new Date(), paidAt: new Date(), status: 'PAID' },
  })

  return NextResponse.json({ ok: true, ref: payslipRef })
}
