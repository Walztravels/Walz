import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/resend'
import { buildEmailHtml } from '@/lib/email-hub'

export const dynamic = 'force-dynamic'

interface AttachmentInput {
  filename: string
  content:  string   // base64-encoded file content
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    to:           string[]
    cc?:          string[]
    bcc?:         string[]
    subject:      string
    bodyText:     string
    category?:    string
    refType?:     string
    refId?:       string
    threadId?:    string
    attachments?: AttachmentInput[]
  }

  if (!body.to?.length || !body.subject || !body.bodyText) {
    return NextResponse.json(
      { error: 'to, subject, and bodyText are required' },
      { status: 400 },
    )
  }

  const trackingId = randomUUID()

  // Build staff object for the signature
  const staff = {
    staffName:  session.name  || session.email,
    staffRole:  session.roleTitle || 'Travel Consultant',
    staffEmail: session.email,
  }

  const html = buildEmailHtml(body.bodyText, staff, trackingId)

  // ── Step 1: Send via Resend ────────────────────────────────────────────────
  let resendId: string | null = null
  try {
    const resend = getResend()

    // Build Resend attachments from base64 input
    const attachments = (body.attachments ?? []).map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.content, 'base64'),
    }))

    const sendResp = await resend.emails.send({
      from:        'Walz Travels <bookings@walztravels.com>',
      replyTo:     'bookings@walztravels.com',
      to:          body.to,
      cc:          body.cc  ?? [],
      bcc:         body.bcc ?? [],
      subject:     body.subject,
      html,
      text:        body.bodyText,
      ...(attachments.length > 0 && { attachments }),
    })

    if ((sendResp as { error?: { message?: string } }).error) {
      const resendErr = (sendResp as { error?: { message?: string } }).error
      console.error('[email/compose] Resend error', resendErr)
      return NextResponse.json(
        { error: `Resend error: ${resendErr?.message ?? 'Unknown error'}` },
        { status: 502 },
      )
    }

    resendId = (sendResp as { data?: { id?: string } }).data?.id ?? null
  } catch (err) {
    console.error('[email/compose] Resend threw', err)
    const msg = err instanceof Error ? err.message : 'Resend unavailable'
    return NextResponse.json({ error: `Failed to send: ${msg}` }, { status: 502 })
  }

  // ── Step 2: Persist thread + message ───────────────────────────────────────
  try {
    let thread
    let message

    if (body.threadId) {
      ;[thread, message] = await prisma.$transaction([
        prisma.emailThread.update({
          where: { id: body.threadId },
          data:  { lastEmailAt: new Date() },
        }),
        prisma.emailMessage.create({
          data: {
            threadId:   body.threadId,
            direction:  'out',
            from:       session.email,
            fromName:   staff.staffName,
            to:         body.to,
            cc:         body.cc  ?? [],
            bcc:        body.bcc ?? [],
            subject:    body.subject,
            bodyHtml:   html,
            bodyText:   body.bodyText,
            status:     'sent',
            sentAt:     new Date(),
            sentBy:     session.id,
            resendId,
            trackingId,
          },
        }),
      ])
    } else {
      thread = await prisma.emailThread.create({
        data: {
          subject:      body.subject,
          category:     body.category ?? 'sent',
          status:       'open',
          participants: body.to.map(email => ({ email })),
          refType:      body.refType  ?? null,
          refId:        body.refId    ?? null,
          lastEmailAt:  new Date(),
        },
      })

      message = await prisma.emailMessage.create({
        data: {
          threadId:   thread.id,
          direction:  'out',
          from:       session.email,
          fromName:   staff.staffName,
          to:         body.to,
          cc:         body.cc  ?? [],
          bcc:        body.bcc ?? [],
          subject:    body.subject,
          bodyHtml:   html,
          bodyText:   body.bodyText,
          status:     'sent',
          sentAt:     new Date(),
          sentBy:     session.id,
          resendId,
          trackingId,
        },
      })
    }

    return NextResponse.json({ thread, message }, { status: 201 })
  } catch (err) {
    console.error('[email/compose] DB save failed (email was sent — resendId:', resendId, ')', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Email sent but failed to save to inbox: ${msg}` },
      { status: 500 },
    )
  }
}
