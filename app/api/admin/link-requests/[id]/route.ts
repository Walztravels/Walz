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

    // Notify client
    const resend = getResend()
    if (resend) {
      resend.emails.send({
        from:    'Walz Travels <contact@walztravels.com>',
        to:      linkReq.userEmail,
        subject: 'Your Walz Travels applications are now in your portal',
        html: `<p>Hi,</p><p>Your previous applications with Walz Travels are now linked to your portal account.</p><p><a href="https://www.walztravels.com/portal/dashboard">View My Applications →</a></p>`,
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
