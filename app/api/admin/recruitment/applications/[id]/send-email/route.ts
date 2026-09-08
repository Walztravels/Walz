import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { renderTemplate, textToHtml, COMPANY_NAME, type TemplateVars } from '@/lib/recruitment/templates'

export const dynamic = 'force-dynamic'

const SEND_FROM = 'Walz Travels <hello@walztravels.com>'

/**
 * POST — a staff member sends one email to this application's candidate.
 * Always an explicit human action: staff choose (and can edit) the content
 * before sending; nothing here fires on stage moves or from AI. The sent
 * message lands in the application's careers Email Hub thread.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: params.id },
      select: {
        id: true, reference: true, jobId: true,
        candidate: { select: { email: true, firstName: true, lastName: true } },
      },
    })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    const job = await prisma.jobOpening.findUnique({
      where: { id: application.jobId }, select: { title: true },
    })

    const body = await req.json().catch(() => ({}))
    const subjectRaw = typeof body.subject === 'string' ? body.subject.trim() : ''
    const bodyRaw    = typeof body.body === 'string' ? body.body.trim() : ''
    if (!subjectRaw || subjectRaw.length > 200) return NextResponse.json({ error: 'Subject is required (max 200 chars)' }, { status: 400 })
    if (!bodyRaw || bodyRaw.length > 10_000)    return NextResponse.json({ error: 'Body is required (max 10000 chars)' }, { status: 400 })
    if (bodyRaw.includes('[Describe what you need here before sending.]')) {
      return NextResponse.json({ error: 'Please replace the placeholder instruction text before sending' }, { status: 400 })
    }

    const vars: TemplateVars = {
      firstName:   application.candidate.firstName,
      lastName:    application.candidate.lastName,
      jobTitle:    job?.title ?? 'the role',
      reference:   application.reference,
      companyName: COMPANY_NAME,
      senderName:  session.name ?? 'The Recruitment Team',
    }
    const subjectR = renderTemplate(subjectRaw, vars)
    const bodyR    = renderTemplate(bodyRaw, vars)
    if (!subjectR.ok) return NextResponse.json({ error: `Unknown placeholder(s) in subject: ${subjectR.unknown.join(', ')}` }, { status: 400 })
    if (!bodyR.ok)    return NextResponse.json({ error: `Unknown placeholder(s) in body: ${bodyR.unknown.join(', ')}` }, { status: 400 })

    // 1. Send.
    const html = textToHtml(bodyR.rendered)
    const sendResp = await getResend().emails.send({
      from:    SEND_FROM,
      to:      application.candidate.email,
      subject: subjectR.rendered,
      html,
      text:    bodyR.rendered,
    })
    const respErr = (sendResp as { error?: { message?: string } }).error
    if (respErr) {
      return NextResponse.json({ error: `Send failed: ${respErr.message ?? 'unknown error'}` }, { status: 502 })
    }
    const resendId = (sendResp as { data?: { id?: string } }).data?.id ?? null

    // 2. Record in the application's careers thread (create if none yet).
    try {
      const now = new Date()
      let thread = await prisma.emailThread.findFirst({
        where:  { refType: 'application', refId: application.id },
        select: { id: true },
      })
      if (!thread) {
        thread = await prisma.emailThread.create({
          data: {
            subject:      subjectR.rendered,
            category:     'careers',
            status:       'open',
            lastEmailAt:  now,
            participants: [{ email: application.candidate.email, name: `${application.candidate.firstName} ${application.candidate.lastName}` }] as never,
            refType:      'application',
            refId:        application.id,
          },
          select: { id: true },
        })
      } else {
        await prisma.emailThread.update({ where: { id: thread.id }, data: { lastEmailAt: now } })
      }
      await prisma.emailMessage.create({
        data: {
          threadId:  thread.id,
          direction: 'out',
          from:      'hello@walztravels.com',
          fromName:  session.name ?? 'Walz Travels',
          to:        [application.candidate.email],
          subject:   subjectR.rendered,
          bodyHtml:  html,
          bodyText:  bodyR.rendered,
          status:    'sent',
          sentAt:    now,
          sentBy:    session.id,
          resendId,
        },
      })
    } catch (err) {
      // The email went out; a bookkeeping failure is logged, not fatal.
      console.error('[recruitment send-email] Email Hub record failed (sent, resendId:', resendId, ')', err)
    }

    await recruitmentAudit(session, 'Candidate Emailed',
      `${application.reference}: "${subjectR.rendered.slice(0, 120)}"${typeof body.templateKey === 'string' ? ` (template ${body.templateKey})` : ''}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[recruitment send-email POST]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
