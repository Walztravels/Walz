import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { renderToBuffer }            from '@react-pdf/renderer'
import type { DocumentProps }        from '@react-pdf/renderer'
import { VisaIntelligenceReport }    from '@/lib/pdf/VisaIntelligenceReport'
import { getResend }                 from '@/lib/email-internal'
import React                         from 'react'
import type { ReactElement }         from 'react'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Accepts JSON body:
//   { analysis, applicantName, destination, passportCountry, email?, applicationId?, action }
// action: 'download' | 'email'
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const {
    analysis, applicantName, destination, passportCountry,
    email, applicationId, action,
  } = body as {
    analysis:        unknown
    applicantName?:  string
    destination?:    string
    passportCountry?: string
    email?:          string
    applicationId?:  string
    action:          'download' | 'email'
  }

  if (!analysis) return NextResponse.json({ error: 'No analysis provided' }, { status: 400 })
  if (!action)   return NextResponse.json({ error: 'action required: download | email' }, { status: 400 })

  const name    = applicantName   ?? 'Applicant'
  const dest    = destination     ?? 'uk'
  const country = passportCountry ?? 'Nigeria'
  const refId   = applicationId   ?? `WALZ-VFIP-${Date.now().toString(36).toUpperCase()}`

  // ── Generate PDF buffer ───────────────────────────────────────────────────
  const element = React.createElement(VisaIntelligenceReport, {
    analysis:        analysis as Parameters<typeof VisaIntelligenceReport>[0]['analysis'],
    applicantName:   name,
    destination:     dest,
    passportCountry: country,
    refId,
  }) as unknown as ReactElement<DocumentProps>

  const pdfBuffer = await renderToBuffer(element)
  const pdfBytes  = new Uint8Array(pdfBuffer)

  const safeName = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  const fileName = `Walz-Visa-Report-${safeName}-${refId}.pdf`

  // ── Download ──────────────────────────────────────────────────────────────
  if (action === 'download') {
    return new Response(pdfBytes, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length':      String(pdfBuffer.length),
      },
    })
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (action === 'email') {
    if (!email) return NextResponse.json({ error: 'email is required for email action' }, { status: 400 })

    const resend  = getResend()
    const destMap: Record<string, string> = {
      uk: 'United Kingdom', canada: 'Canada', usa: 'United States',
      schengen: 'Schengen / Europe', uae: 'UAE', australia: 'Australia',
    }
    const destLabel = destMap[dest.toLowerCase()] ?? dest.toUpperCase()

    await resend.emails.send({
      from:    'Walz Travels Visa Team <visa@walztravels.com>',
      to:      email,
      subject: `Your Jade Financial Intelligence Report — ${name}`,
      attachments: [{ filename: fileName, content: pdfBuffer }],
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
          <div style="background:#0B1F3A;padding:32px 40px;text-align:center;">
            <p style="margin:0;color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">WALZ TRAVELS</p>
            <p style="margin:4px 0 0;color:#64748b;font-size:9px;letter-spacing:2px;">JADE FINANCIAL INTELLIGENCE</p>
          </div>
          <div style="padding:36px 40px;">
            <p style="color:#0B1F3A;font-size:16px;margin:0 0 8px;">Dear ${name},</p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
              Please find attached your personalised <strong>Jade Financial Intelligence Report</strong>
              for your ${destLabel} visa application.
            </p>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 16px;">This report contains:</p>
            <ul style="color:#475569;font-size:14px;line-height:2;padding-left:24px;margin:0 0 24px;">
              <li>Full forensic analysis of your bank statement</li>
              <li>Financial credibility score across 6 dimensions</li>
              <li>Immigration officer simulation and verdict</li>
              <li>Behavioural anomaly detection results</li>
              <li>Approval probability assessment</li>
              <li>Personalised recommendations and action plan</li>
            </ul>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 32px;">
              Your Walz Travels consultant will be in touch to discuss the findings and guide you through the next steps.
            </p>
            <div style="background:#f8fafc;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;margin:0 0 32px;">
              <p style="margin:0;color:#0B1F3A;font-size:13px;font-weight:600;">Next Step:</p>
              <p style="margin:4px 0 0;color:#475569;font-size:13px;line-height:1.6;">
                WhatsApp your consultant on
                <a href="https://wa.me/12317902336" style="color:#C9A84C;font-weight:700;"> +12317902336</a>
                to discuss your report and proceed with your application.
              </p>
            </div>
            <div style="text-align:center;margin-bottom:32px;">
              <a href="https://www.walztravels.com"
                style="display:inline-block;background:#C9A84C;color:#0B1F3A;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">
                Visit Walz Travels
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
              This report has been prepared by Walz Travels Jade Financial Intelligence.
              The financial analysis is AI-generated and should be reviewed by your consultant before submission.
              Reference: ${refId}
            </p>
          </div>
          <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
              © ${new Date().getFullYear()} Walz Travels Ltd · walztravels.com · contact@walztravels.com
            </p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true, refId })
  }

  return NextResponse.json({ error: 'Invalid action. Use: download | email' }, { status: 400 })
}
