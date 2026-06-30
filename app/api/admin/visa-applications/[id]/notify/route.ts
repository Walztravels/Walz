import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'


export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const body = await req.json().catch(() => ({})) as {
    subject?: string
    message?: string
    appointmentDate?: string
    appointmentLocation?: string
    appointmentNotes?: string
    updateStatus?: string
  }

  const app = await prisma.visaApplication.findUnique({
    where: { id },
    select: {
      id: true, referenceNumber: true,
      firstName: true, lastName: true, email: true,
      destinationIso2: true, status: true,
    },
  })

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientName = `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || 'Valued Client'

  const updateData: Record<string, unknown> = {}
  if (body.updateStatus) updateData.status = body.updateStatus

  // These columns may not exist in DB until SQL migration is run; ignore errors silently
  const extendedData: Record<string, unknown> = {
    lastEmailSentAt: new Date(),
    ...(body.appointmentDate     ? { appointmentDate:     new Date(body.appointmentDate) } : {}),
    ...(body.appointmentLocation ? { appointmentLocation: body.appointmentLocation }        : {}),
    ...(body.appointmentNotes    ? { appointmentNotes:    body.appointmentNotes }           : {}),
  }

  try {
    await prisma.visaApplication.update({ where: { id }, data: { ...updateData, ...extendedData }, select: { id: true } })
  } catch {
    // Extended columns not yet in DB — update only confirmed-safe fields
    if (Object.keys(updateData).length > 0) {
      await prisma.visaApplication.update({ where: { id }, data: updateData, select: { id: true } }).catch(() => {})
    }
  }

  const apptFormatted = body.appointmentDate
    ? new Date(body.appointmentDate).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  let emailSent = false
  if (app.email) {
    await getResend().emails.send({
      from:    'Walz Travels Visa Team <visa@walztravels.com>',
      to:      app.email,
      subject: body.subject ?? `Update on your visa application — Ref: ${app.referenceNumber}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0B1F3A;padding:32px;text-align:center">
            <img src="https://www.walztravels.com/walz-logo.png" width="120" alt="Walz Travels" />
          </div>
          <div style="padding:32px;background:#ffffff">
            <p style="color:#0B1F3A;font-size:16px">Hi ${clientName},</p>
            <p style="color:#0B1F3A;font-size:14px;margin-bottom:24px">
              We have an update on your visa application for
              <strong>${app.destinationIso2?.toUpperCase()}</strong>
              (Ref: <strong style="color:#C9A84C">${app.referenceNumber}</strong>).
            </p>

            ${body.message ? `<div style="background:#f5f0e8;border-radius:12px;padding:20px;margin-bottom:24px">
              <p style="color:#0B1F3A;font-size:14px;margin:0;white-space:pre-wrap">${body.message}</p>
            </div>` : ''}

            ${apptFormatted ? `
            <div style="background:#0B1F3A;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
              <p style="color:#C9A84C;font-size:11px;font-weight:bold;letter-spacing:2px;margin:0 0 8px">
                APPOINTMENT DATE
              </p>
              <p style="color:#ffffff;font-size:20px;font-weight:bold;margin:0">${apptFormatted}</p>
              ${body.appointmentLocation ? `<p style="color:#ffffff80;font-size:13px;margin:8px 0 0">📍 ${body.appointmentLocation}</p>` : ''}
            </div>` : ''}

            <p style="color:#666;font-size:13px">
              If you have any questions, please contact us:<br/>
              📱 <a href="https://wa.me/447398753797" style="color:#C9A84C">WhatsApp: +44 7398 753797</a><br/>
              📧 <a href="mailto:visa@walztravels.com" style="color:#C9A84C">visa@walztravels.com</a>
            </p>
          </div>
          <div style="background:#f5f5f5;padding:16px;text-align:center">
            <p style="color:#999;font-size:12px;margin:0">© Walz Travels · walztravels.com</p>
          </div>
        </div>
      `,
    })
    emailSent = true
  }

  await prisma.activityLog.create({
    data: {
      staffId:    session.id,
      staffName:  session.name,
      staffRole:  session.role,
      action:     'visa_email_sent',
      module:     'visa',
      entityId:   id,
      entityType: 'visa_application',
      detail:     `Email sent to ${app.email}: ${body.subject ?? 'Update notification'}`,
    },
  }).catch(() => {})

  return NextResponse.json({ success: true, emailSent })
}
