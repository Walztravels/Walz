import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'


const STAGE_ACCENT: Record<string, string> = {
  APPROVED:            '#22c55e',
  REJECTED:            '#ef4444',
  SUBMITTED:           '#6366f1',
  AWAITING_DECISION:   '#f97316',
  PROCESSING:          '#8b5cf6',
  DOCUMENTS_RECEIVED:  '#3b82f6',
  DOCUMENTS_PENDING:   '#f59e0b',
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const updates = await prisma.visaApplicationUpdate.findMany({
    where:   { applicationId: params.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ updates })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const {
    type, newStatus, title, message, sendEmail,
    isClientVisible = true, documentName, documentUrl, documentType,
  } = await req.json()

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message required' }, { status: 400 })
  }

  const app = await prisma.portalApplication.findUnique({
    where:   { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update stage if changed
  if (newStatus) {
    await prisma.portalApplication.update({
      where: { id: params.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data:  { stage: newStatus as any },
    })
  }

  // Create update record
  const update = await prisma.visaApplicationUpdate.create({
    data: {
      applicationId:   params.id,
      adminName:       session.email ?? 'Walz Travels Team',
      type:            type ?? 'STATUS_UPDATE',
      newStatus:       newStatus ?? null,
      title,
      message,
      isClientVisible,
      documentName:    documentName ?? null,
      documentUrl:     documentUrl  ?? null,
      documentType:    documentType ?? null,
      emailSent:       false,
    },
  })

  let emailSent = false

  if (sendEmail && app.user?.email) {
    const clientName  = app.user.name ?? 'Valued Client'
    const trackingUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/visa/track/${app.trackingToken ?? app.id}`
    const accent      = STAGE_ACCENT[newStatus ?? ''] ?? '#C9A84C'
    const textColor   = ['APPROVED','REJECTED'].includes(newStatus ?? '') ? '#fff' : '#0B1F3A'

    try {
      await getResend().emails.send({
        from:    'Walz Travels <visa@walztravels.com>',
        to:      app.user.email,
        subject: `${title} — Your Visa Application Update`,
        html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f5f0e8;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;">
  <div style="background:#0B1F3A;border-radius:16px 16px 0 0;padding:28px;text-align:center;">
    <p style="color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">Visa Application Update</p>
    <h1 style="color:white;margin:0;font-size:20px;">${title}</h1>
  </div>
  <div style="background:white;padding:28px;">
    <p style="color:#0B1F3A;font-size:15px;margin:0 0 16px;">Dear ${clientName.split(' ')[0]},</p>
    <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 20px;">${message.replace(/\n/g, '<br/>')}</p>
    ${documentUrl ? `
    <div style="background:#f5f0e8;border-radius:10px;padding:16px;margin:20px 0;">
      <p style="color:#0B1F3A;font-size:12px;font-weight:bold;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">📎 Document Attached</p>
      <a href="${documentUrl}" style="color:#C9A84C;font-size:14px;font-weight:bold;text-decoration:none;">${documentName ?? 'Download Document'} →</a>
    </div>` : ''}
    <div style="text-align:center;margin:24px 0;">
      <a href="${trackingUrl}" style="display:inline-block;background:${accent};color:${textColor};font-weight:bold;font-size:14px;padding:13px 28px;border-radius:50px;text-decoration:none;">
        Track My Application →
      </a>
    </div>
    <p style="color:#999;font-size:12px;text-align:center;margin:20px 0 0;">Questions? Reply to this email or WhatsApp us at +44 7398 753797</p>
  </div>
  <div style="background:#0B1F3A;border-radius:0 0 16px 16px;padding:16px;text-align:center;">
    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">Walz Travels · contact@walztravels.com · walztravels.com</p>
  </div>
</div>
</body>
</html>`,
      })

      await prisma.visaApplicationUpdate.update({
        where: { id: update.id },
        data:  { emailSent: true, emailSentAt: new Date() },
      })
      emailSent = true
    } catch (e) {
      console.error('[updates/email]', e)
    }
  }

  return NextResponse.json({ update, emailSent, success: true })
}
