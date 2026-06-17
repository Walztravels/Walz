import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { getVisaConfig } from '@/lib/visa-config'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

const BASE_URL = 'https://walztravels.com'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const {
    appointmentDate,
    appointmentTime,
    appointmentLocation,
    appointmentRef,
    documents,
    extraInstructions,
  } = await req.json()

  const app = await prisma.visaApplication.findUnique({
    where: { id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      referenceNumber: true, destinationIso2: true, visaType: true,
    },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const emailTo = app.email
  if (!emailTo) return NextResponse.json({ error: 'No email on file' }, { status: 400 })

  const config     = getVisaConfig(app.destinationIso2)
  const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Valued Client'
  const resend     = getResend()

  // Save appointment details to DB
  if (appointmentDate || appointmentLocation) {
    await prisma.visaApplication.update({
      where: { id },
      data: {
        ...(appointmentDate     && { appointmentDate: new Date(appointmentDate) }),
        ...(appointmentLocation && { appointmentLocation }),
        ...(appointmentRef      && { appointmentNotes: appointmentRef }),
        updatedAt: new Date(),
      },
    }).catch(() => {})
  }

  const docListHtml = (documents ?? []).map((doc: string) =>
    `<tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">
        <span style="color:#16a34a;margin-right:8px;">✓</span>${doc}
      </td>
    </tr>`
  ).join('')

  const appointmentDateFormatted = appointmentDate
    ? new Date(appointmentDate).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  await resend.emails.send({
    from:    'Jade at Walz Travels <jade@walztravels.com>',
    to:      emailTo,
    subject: `Embassy Appointment Preparation — ${app.referenceNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">

        <!-- Header -->
        <div style="background:#0B1F3A;padding:32px 40px 24px;text-align:center;">
          <img src="${BASE_URL}/walz-logo.png" alt="Walz Travels" width="160"
            style="height:auto;display:block;margin:0 auto 8px;"/>
          <p style="margin:0;color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;">
            Embassy Preparation Pack
          </p>
        </div>

        <div style="padding:32px 40px;">
          <h2 style="margin:0 0 8px;color:#0B1F3A;font-size:20px;">
            Your Embassy Appointment is Confirmed
          </h2>
          <p style="color:#475569;margin:0 0 24px;font-size:14px;">
            Hi ${clientName}, here is everything you need for your
            ${config?.flag ?? ''} ${config?.name ?? app.destinationIso2} visa appointment.
            Please read carefully and bring <strong>every document</strong> on this list.
          </p>

          ${(appointmentDate || appointmentTime || appointmentLocation) ? `
          <div style="background:#0B1F3A;border-radius:12px;padding:20px 24px;margin:0 0 28px;">
            <p style="color:#C9A84C;font-size:11px;margin:0 0 12px;
              text-transform:uppercase;letter-spacing:1.5px;">📅 Appointment Details</p>
            <table style="width:100%;border-collapse:collapse;">
              ${appointmentDate ? `
              <tr>
                <td style="color:#94a3b8;font-size:13px;padding:4px 0;width:40%;">Date</td>
                <td style="color:#ffffff;font-size:13px;font-weight:600;padding:4px 0;">
                  ${appointmentDateFormatted}${appointmentTime ? ` at ${appointmentTime}` : ''}
                </td>
              </tr>` : ''}
              ${appointmentLocation ? `
              <tr>
                <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Location</td>
                <td style="color:#ffffff;font-size:13px;font-weight:600;padding:4px 0;">
                  ${appointmentLocation}
                </td>
              </tr>` : ''}
              ${appointmentRef ? `
              <tr>
                <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Reference</td>
                <td style="color:#C9A84C;font-size:13px;font-weight:700;padding:4px 0;
                  letter-spacing:1px;">
                  ${appointmentRef}
                </td>
              </tr>` : ''}
            </table>
          </div>` : ''}

          <h3 style="color:#0B1F3A;font-size:16px;margin:0 0 4px;">
            📋 Documents to Bring to the Embassy
          </h3>
          <p style="color:#64748b;font-size:13px;margin:0 0 16px;">
            Bring <strong>originals AND photocopies</strong> of everything listed below.
            Missing documents may result in your application being rejected on the day.
          </p>

          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;
            border-radius:8px;overflow:hidden;margin:0 0 24px;">
            ${docListHtml}
          </table>

          ${extraInstructions ? `
          <div style="background:#fef9f0;border:1px solid #f59e0b;border-radius:10px;
            padding:16px 20px;margin:0 0 24px;">
            <p style="margin:0 0 6px;font-size:12px;color:#92400e;
              text-transform:uppercase;letter-spacing:1px;font-weight:700;">
              ⚠️ Important Instructions
            </p>
            <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;
              white-space:pre-line;">${extraInstructions}</p>
          </div>` : ''}

          <div style="background:#F4F6F9;border-radius:10px;padding:20px;
            text-align:center;margin:0 0 24px;">
            <p style="color:#475569;font-size:13px;margin:0 0 12px;">
              Track your application status anytime from your portal
            </p>
            <a href="${BASE_URL}/portal/visa-application/${app.id}"
              style="display:inline-block;background:#C9A84C;color:#0B1F3A;
                font-weight:700;font-size:14px;padding:12px 24px;
                border-radius:10px;text-decoration:none;">
              View My Application →
            </a>
          </div>

          <p style="color:#64748b;font-size:13px;line-height:1.7;margin:0;">
            If you have any questions before your appointment, please reach out to us
            — we're here to help you every step of the way.
          </p>
        </div>

        <!-- Footer -->
        <div style="padding:24px 40px;background:#F4F6F9;
          border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0 0 8px;color:#0B1F3A;font-weight:600;font-size:13px;">
            Questions? We're here to help.
          </p>
          <p style="margin:0;color:#64748b;font-size:13px;">
            💬 <a href="https://wa.me/447398753797" style="color:#C9A84C;">
              WhatsApp +44 7398 753797</a>
            &nbsp;|&nbsp;
            ✉️ <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">
              contact@walztravels.com</a>
          </p>
          <p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">
            Ref: ${app.referenceNumber} · Walz Travels · walztravels.com
          </p>
        </div>

      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
