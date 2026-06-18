import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const CRON_SECRET = process.env.CRON_SECRET

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function paystubHtml(params: {
  name: string; month: number; year: number; currency: string
  baseSalary: number; bonus: number; allowance: number
  attendanceDeduction: number; otherDeduction: number; deductionNote: string | null
  grossPay: number; netPay: number; missedCheckIns: number
}) {
  const { name, month, year, currency, baseSalary, bonus, allowance, attendanceDeduction, otherDeduction, deductionNote, grossPay, netPay, missedCheckIns } = params
  const f = (n: number) => fmtCurrency(n, currency)
  const payMonth = MONTHS[month - 1]

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paystub – ${payMonth} ${year}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <tr><td style="background:#0B1F3A;padding:32px 36px;">
      <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Walz Travels</p>
      <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">Payslip — ${payMonth} ${year}</h1>
      <p style="color:rgba(255,255,255,0.55);font-size:13px;margin:8px 0 0;">Prepared for: <strong style="color:rgba(255,255,255,0.85);">${name}</strong></p>
    </td></tr>
    <tr><td style="padding:32px 36px;">
      <h3 style="color:#0B1F3A;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;border-bottom:1px solid #e8ecf0;padding-bottom:8px;">Earnings</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Base Salary</td><td align="right" style="color:#0B1F3A;font-weight:600;font-size:14px;">${f(baseSalary)}</td></tr>
        ${bonus > 0     ? `<tr><td style="padding:6px 0;color:#4a5568;font-size:14px;">Bonus</td><td align="right" style="color:#0B1F3A;font-weight:600;font-size:14px;">${f(bonus)}</td></tr>` : ''}
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
      <p style="color:#718096;font-size:12px;margin:0;">This paystub was generated automatically. Salary is scheduled to be credited tomorrow. For queries contact <a href="mailto:hr@walztravels.com" style="color:#C9A84C;">hr@walztravels.com</a>.</p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e8ecf0;">
      <p style="color:#a0aec0;font-size:11px;margin:0;text-align:center;">The Walz Travels Inc · Ontario, Canada · Registered in England &amp; Wales</p>
    </td></tr>
  </table>
</body></html>`
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now       = new Date()
  const tomorrow  = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const payDay    = tomorrow.getDate()
  const month     = tomorrow.getMonth() + 1
  const year      = tomorrow.getFullYear()

  const staffDueToday = await prisma.staffMember.findMany({
    where: { isActive: true, payDay },
  })

  if (staffDueToday.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No paydays tomorrow' })
  }

  const results: { name: string; ok: boolean; error?: string }[] = []

  for (const staff of staffDueToday) {
    try {
      const payslip = await prisma.payslip.findUnique({
        where: { staffMemberId_month_year: { staffMemberId: staff.id, month, year } },
      })

      if (!payslip) {
        results.push({ name: staff.name, ok: false, error: 'No payslip generated for this period' })
        continue
      }

      if (payslip.emailSentAt) {
        results.push({ name: staff.name, ok: true, error: 'Already sent' })
        continue
      }

      const html = paystubHtml({
        name:                staff.name,
        month:               payslip.month,
        year:                payslip.year,
        currency:            payslip.currency,
        baseSalary:          payslip.baseSalary,
        bonus:               payslip.bonus,
        allowance:           payslip.allowance,
        attendanceDeduction: payslip.attendanceDeduction,
        otherDeduction:      payslip.otherDeduction,
        deductionNote:       payslip.deductionNote,
        grossPay:            payslip.grossPay,
        netPay:              payslip.netPay,
        missedCheckIns:      payslip.missedCheckIns,
      })

      await resend.emails.send({
        from:    'Walz Travels HR <hr@walztravels.com>',
        to:      staff.email,
        subject: `Your Paystub – ${MONTHS[month - 1]} ${year}`,
        html,
      })

      await prisma.payslip.update({
        where: { id: payslip.id },
        data:  { emailSentAt: new Date(), status: 'EMAILED' },
      })

      results.push({ name: staff.name, ok: true })
    } catch (e: any) {
      results.push({ name: staff.name, ok: false, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
