import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { TRUSTPILOT_AFS_EMAIL } from '@/lib/email-visa'

const FROM = 'Jade at Walz Travels <jade@walztravels.com>'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const app = await prisma.visaApplication.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      status: true,
      firstName: true,
      lastName: true,
      visaType: true,
      referenceNumber: true,
    },
  })

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (app.status !== 'approved') {
    return NextResponse.json(
      { error: 'Review requests can only be sent for approved applications' },
      { status: 400 }
    )
  }

  const emailTo = app.email
  if (!emailTo) {
    return NextResponse.json({ error: 'No email address on file for this application' }, { status: 400 })
  }

  const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'there'

  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to: emailTo,
    bcc: TRUSTPILOT_AFS_EMAIL,
    subject: `${clientName}, how was your experience with Walz Travels?`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:#0B1F3A;padding:28px 32px;text-align:center;">
          <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="140" style="height:auto;display:block;margin:0 auto;" />
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#0B1F3A;font-size:22px;">Congratulations on your visa approval! 🎉</h2>
          <p style="color:#475569;line-height:1.7;margin:0 0 16px;">Hi ${clientName},</p>
          <p style="color:#475569;line-height:1.7;margin:0 0 16px;">
            We're absolutely thrilled that your ${app.visaType || 'visa'} application was approved —
            it was our pleasure working with you on this.
          </p>
          <p style="color:#475569;line-height:1.7;margin:0 0 24px;">
            If you have a moment, we'd love to hear about your experience with Walz Travels.
            Your review helps other Nigerians and Ghanaians find trusted visa and travel support.
          </p>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="https://www.trustpilot.com/review/walztravels.com"
               style="display:inline-block;background:#00b67a;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
              ⭐ Leave a Review on Trustpilot
            </a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:0;">
            — Jade &amp; the Walz Travels team<br />
            <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a> ·
            <a href="https://wa.me/12317902336" style="color:#C9A84C;">+12317902336</a>
          </p>
        </div>
      </div>
    `,
  })

  console.log(
    `[Trustpilot] Review request sent for application ${params.id} (${app.referenceNumber}) to ${emailTo} by ${session.email}`
  )

  return NextResponse.json({ success: true })
}
