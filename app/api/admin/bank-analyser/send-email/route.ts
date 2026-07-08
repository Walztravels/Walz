import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/resend'


export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { clientEmail, clientName, destination, analysis, refId, reportUrl } = await req.json()

  if (!clientEmail || !analysis) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const status = analysis.status as 'PASS' | 'REVIEW' | 'FLAG'

  const statusConfig = {
    PASS:   { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '✅', label: 'PASS — Your statement looks strong' },
    REVIEW: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', icon: '🟡', label: 'REVIEW — One item needs attention' },
    FLAG:   { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🔴', label: 'FLAG — Some items need attention before applying' },
  }
  const cfg = statusConfig[status] ?? statusConfig.REVIEW

  const recsHtml = (analysis.recommendations ?? []).length > 0
    ? `<div style="margin-top:20px">
        <p style="font-weight:600;color:#0B1F3A;margin-bottom:8px">Recommendations before you apply:</p>
        <ul style="margin:0;padding-left:20px;color:#374151">
          ${(analysis.recommendations as string[]).map((r: string) => `<li style="margin-bottom:6px">${r}</li>`).join('')}
        </ul>
      </div>`
    : ''

  const metricsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:20px">
      <tr>
        <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px 0 0 6px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Avg Balance</div>
          <div style="font-size:16px;font-weight:700;color:#0B1F3A;margin-top:2px">
            ${analysis.currency ?? ''} ${(analysis.averageMonthlyBalance ?? 0).toLocaleString()}
          </div>
        </td>
        <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-left:none">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Lowest Balance</div>
          <div style="font-size:16px;font-weight:700;color:#0B1F3A;margin-top:2px">
            ${analysis.currency ?? ''} ${(analysis.lowestBalance ?? 0).toLocaleString()}
          </div>
        </td>
        <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-left:none;border-radius:0 6px 6px 0">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Monthly Income</div>
          <div style="font-size:16px;font-weight:700;color:#0B1F3A;margin-top:2px">
            ${analysis.currency ?? ''} ${(analysis.estimatedMonthlyIncome ?? 0).toLocaleString()}
            ${analysis.salaryCreditsDetected ? ' ✅' : ''}
          </div>
        </td>
      </tr>
    </table>`

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <div style="background:#0B1F3A;padding:28px 32px">
      <p style="margin:0;color:#C9A84C;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:600">Walz Travels</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700">Bank Statement Analysis</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.6);font-size:13px">
        ${destination.toUpperCase()} Visa Application${refId ? ` · Ref: ${refId}` : ''}
      </p>
    </div>

    <div style="padding:32px">
      <p style="margin:0 0 20px;color:#374151;font-size:15px">Hi ${clientName.split(' ')[0]},</p>
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6">
        Our visa team has reviewed your bank statement for your <strong>${destination.toUpperCase()} visa application</strong>.
        Here is our assessment:
      </p>

      <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;padding:20px 24px">
        <p style="margin:0;font-size:17px;font-weight:700;color:${cfg.color}">${cfg.icon} ${cfg.label}</p>
        ${analysis.statementPeriod ? `<p style="margin:6px 0 0;color:#6b7280;font-size:13px">Period reviewed: ${analysis.statementPeriod}</p>` : ''}
      </div>

      ${metricsHtml}

      <div style="margin-top:24px;padding:20px;background:#f9fafb;border-radius:10px;border-left:4px solid #C9A84C">
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.7">${analysis.summary ?? ''}</p>
      </div>

      ${recsHtml}

      ${reportUrl ? `
      <div style="margin-top:24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px 24px">
        <p style="margin:0 0 8px;font-weight:700;color:#0B1F3A;font-size:14px">📄 Your Financial Eligibility Report</p>
        <p style="margin:0 0 14px;color:#374151;font-size:13px;line-height:1.6">
          View your full report online — includes embassy readiness, income verification, and personalised recommendations.
          The link is valid for 30 days.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#0B1F3A;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;font-size:14px">
          View Full Report →
        </a>
        <p style="margin:10px 0 0;color:#9ca3af;font-size:11px">
          Or copy this link: <span style="color:#0B1F3A">${reportUrl}</span>
        </p>
      </div>` : ''}

      <div style="margin-top:24px;padding:20px;background:#0B1F3A;border-radius:10px;text-align:center">
        <p style="margin:0 0 14px;color:rgba(255,255,255,.8);font-size:14px">Have questions? Our team is ready to help.</p>
        <div>
          <a href="https://wa.me/12317902336" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;font-weight:700;padding:10px 24px;border-radius:6px;font-size:13px;margin:4px">
            WhatsApp UK
          </a>
          <a href="mailto:contact@walztravels.com" style="display:inline-block;background:rgba(255,255,255,.1);color:#fff;text-decoration:none;font-weight:600;padding:10px 24px;border-radius:6px;font-size:13px;border:1px solid rgba(255,255,255,.2);margin:4px">
            Email Us
          </a>
        </div>
      </div>

      <p style="margin:28px 0 0;color:#9ca3af;font-size:12px;line-height:1.6">
        This analysis is prepared by Walz Travels as guidance for your visa application.
        It is advisory only and does not guarantee a visa outcome.
        Entry decisions are made solely by destination country immigration authorities.
      </p>
    </div>

    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
      <p style="margin:0;color:#9ca3af;font-size:12px">
        © ${new Date().getFullYear()} Walz Travels · contact@walztravels.com
      </p>
    </div>
  </div>
</body>
</html>`

  const { data, error } = await getResend().emails.send({
    from: 'Walz Travels <contact@walztravels.com>',
    to: clientEmail,
    subject: `Your ${destination.toUpperCase()} Visa Bank Statement Analysis — Walz Travels`,
    html: htmlBody,
    replyTo: 'contact@walztravels.com',
  })

  if (error) {
    console.error('Resend error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, emailId: data?.id })
}
