import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as { action: 'approve' | 'reject'; notes?: string }
  const linkReq = await prisma.applicationLinkRequest.findUnique({ where: { id: params.id } })
  if (!linkReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'approve') {
    // Update the application with userId
    try {
      if (linkReq.applicationType === 'visa') {
        await prisma.visaApplication.update({ where: { id: linkReq.applicationId }, data: { userId: linkReq.userId } })
      } else if (linkReq.applicationType === 'trip') {
        await prisma.tripRequest.update({ where: { id: linkReq.applicationId }, data: { userId: linkReq.userId } })
      } else if (linkReq.applicationType === 'tour') {
        await prisma.tourEnquiry.update({ where: { id: linkReq.applicationId }, data: { userId: linkReq.userId } })
      }
    } catch { /* application may have been deleted */ }

    await prisma.applicationLinkRequest.update({
      where: { id: params.id },
      data: { status: 'approved', reviewedBy: session.email, reviewedAt: new Date(), notes: body.notes },
    })

    // Create portal notification
    prisma.portalNotification.create({
      data: {
        userId: linkReq.userId,
        type:   'application_linked',
        title:  'Application added to your portal',
        body:   `Your ${linkReq.applicationLabel ?? linkReq.applicationType} application has been linked to your Walz Travels account. You can now track it from your dashboard.`,
        data: {
          applicationId:    linkReq.applicationId,
          applicationType:  linkReq.applicationType,
          applicationLabel: linkReq.applicationLabel,
        },
      },
    }).catch(() => {})

    // Notify client by email
    const resend = getResend()
    if (resend) {
      const user = await prisma.user.findUnique({
        where:  { id: linkReq.userId },
        select: { name: true },
      }).catch(() => null)

      resend.emails.send({
        from:    'Walz Travels <contact@walztravels.com>',
        to:      linkReq.userEmail,
        subject: '✅ Your application is now in your Walz portal',
        html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#0B1F3A;">Good news, ${user?.name ?? 'there'}! 👋</h2>
  <p style="color:#444;line-height:1.6;">
    Your <strong>${linkReq.applicationLabel ?? linkReq.applicationType}</strong> application
    has been linked to your Walz Travels portal account.
  </p>
  <p style="color:#444;line-height:1.6;">
    You can now view your application status, track progress, and receive updates directly from your portal dashboard.
  </p>
  <a href="https://www.walztravels.com/dashboard"
     style="display:inline-block;margin:20px 0;padding:12px 28px;background:#C9A84C;color:#0B1F3A;text-decoration:none;border-radius:8px;font-weight:700;">
    View My Dashboard →
  </a>
  <p style="color:#888;font-size:13px;margin-top:32px;">
    Walz Travels · contact@walztravels.com · +12317902336
  </p>
</div>`,
      }).catch(() => {})
    }
  } else {
    await prisma.applicationLinkRequest.update({
      where: { id: params.id },
      data: { status: 'rejected', reviewedBy: session.email, reviewedAt: new Date(), notes: body.notes },
    })
  }

  return NextResponse.json({ success: true })
}
