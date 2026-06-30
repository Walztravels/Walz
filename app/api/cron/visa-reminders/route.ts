import { NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import prisma from '@/lib/db'


export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = new Headers((req as Request & { headers: Record<string, string> }).headers).get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let sent = 0

  for (const days of [3, 2, 1]) {
    const target   = new Date(now)
    target.setDate(target.getDate() + days)
    const dayStart = new Date(target)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(target)
    dayEnd.setHours(23, 59, 59, 999)

    const applications = await prisma.visaApplication.findMany({
      where: {
        appointmentDate: { gte: dayStart, lte: dayEnd },
        email:           { not: null },
        status:          { notIn: ['approved', 'rejected', 'completed'] },
      },
      select: {
        id: true, referenceNumber: true, email: true,
        firstName: true, lastName: true,
        destinationIso2: true, appointmentDate: true,
        appointmentLocation: true,
      },
    })

    for (const app of applications) {
      const clientName    = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Valued Client'
      const apptFormatted = app.appointmentDate!.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      const urgency = days === 1 ? '⚠️ TOMORROW' : `📅 In ${days} days`

      await getResend().emails.send({
        from:    'Jade by Walz Travels <jade@walztravels.com>',
        to:      app.email!,
        subject: `${urgency} — Your visa appointment reminder (Ref: ${app.referenceNumber})`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0B1F3A;padding:32px;text-align:center">
              <img src="https://www.walztravels.com/walz-logo.png" width="120" alt="Walz Travels" />
            </div>
            <div style="padding:32px;background:#fff">
              <p style="color:#0B1F3A;font-size:16px">Hi ${clientName},</p>
              <p style="color:#0B1F3A;font-size:14px">
                This is a reminder from <strong>Jade</strong>, your Walz Travels AI assistant.
              </p>
              <p style="color:#0B1F3A;font-size:14px">
                Your visa appointment for <strong>${app.destinationIso2?.toUpperCase()}</strong> is
                <strong style="color:#C9A84C">${days === 1 ? 'TOMORROW' : `in ${days} days`}</strong>.
              </p>
              <div style="background:#0B1F3A;border-radius:12px;padding:20px;margin:24px 0;text-align:center">
                <p style="color:#C9A84C;font-size:11px;font-weight:bold;letter-spacing:2px;margin:0 0 8px">YOUR APPOINTMENT</p>
                <p style="color:#fff;font-size:18px;font-weight:bold;margin:0">${apptFormatted}</p>
                ${app.appointmentLocation ? `<p style="color:#ffffff80;font-size:13px;margin:8px 0 0">📍 ${app.appointmentLocation}</p>` : ''}
              </div>
              ${days === 1 ? `
              <div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:16px">
                <p style="color:#92400e;font-size:14px;margin:0">
                  <strong>⚠️ Reminder checklist for tomorrow:</strong><br/>
                  ✓ Valid passport (original + 2 copies)<br/>
                  ✓ All supporting documents<br/>
                  ✓ Appointment confirmation letter<br/>
                  ✓ Arrive 15 minutes early
                </p>
              </div>` : ''}
              <p style="color:#666;font-size:13px">
                Questions? Contact your Walz Travels visa team:<br/>
                📱 <a href="https://wa.me/447398753797" style="color:#C9A84C">+44 7398 753797</a>
              </p>
            </div>
            <div style="background:#f5f5f5;padding:16px;text-align:center">
              <p style="color:#999;font-size:12px;margin:0">Jade — AI Assistant by Walz Travels · walztravels.com</p>
            </div>
          </div>
        `,
      }).catch(e => console.error('[Visa Reminder] Email failed:', e))

      sent++
    }
  }

  return NextResponse.json({ success: true, sent })
}
