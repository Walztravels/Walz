import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/email-internal'
import prisma from '@/lib/db'

const FROM = 'Walz Travels <bookings@walztravels.com>'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super_admin can approve or reject posts' }, { status: 403 })
  }

  const body = await req.json() as {
    status: 'approved' | 'rejected'
    rejectionNote?: string
  }

  const post = await prisma.socialPost.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let nextStatus = body.status
  if (body.status === 'approved' && post.scheduledAt) {
    nextStatus = 'scheduled' as typeof nextStatus
  }

  const updated = await prisma.socialPost.update({
    where: { id: params.id },
    data: {
      status:     nextStatus,
      approvedBy: body.status === 'approved' ? session.email : undefined,
      errorMsg:   body.status === 'rejected' ? (body.rejectionNote ?? 'No reason given') : undefined,
    },
  })

  // Notify the creator by email
  try {
    const resend = getResend()
    if (body.status === 'approved') {
      const schedDate = post.scheduledAt
        ? new Date(post.scheduledAt).toLocaleString('en-GB', {
            dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London',
          })
        : null
      await resend.emails.send({
        from: FROM,
        to:   post.createdBy,
        subject: '✅ Your social post has been approved',
        html: `
          <p>Hi,</p>
          <p>Your social post has been <strong>approved</strong>${schedDate ? ` and scheduled for <strong>${schedDate}</strong>` : ''}.</p>
          <blockquote style="border-left:3px solid #C9A84C;padding-left:12px;color:#555;">
            ${post.caption.slice(0, 200)}…
          </blockquote>
          <p>— Walz Travels Admin</p>
        `,
      })
    } else {
      await resend.emails.send({
        from: FROM,
        to:   post.createdBy,
        subject: '✏️ Your social post needs changes',
        html: `
          <p>Hi,</p>
          <p>Your social post needs some changes before it can go live:</p>
          <blockquote style="border-left:3px solid #e53e3e;padding-left:12px;color:#555;">
            ${body.rejectionNote ?? 'No specific reason given'}
          </blockquote>
          <p>Please update the post and resubmit for approval.</p>
          <p>— Walz Travels Admin</p>
        `,
      })
    }
  } catch {
    // Email failure is non-fatal
  }

  return NextResponse.json({ post: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super_admin can delete posts' }, { status: 403 })
  }

  const post = await prisma.socialPost.findUnique({ where: { id: params.id } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  await prisma.socialPost.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
