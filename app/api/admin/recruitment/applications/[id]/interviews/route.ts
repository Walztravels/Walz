import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { validateInterviewInput } from '@/lib/recruitment/interviews'

export const dynamic = 'force-dynamic'

const NOTIFY_FROM = 'Walz Travels <hello@walztravels.com>'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// GET — interviews for one application (with scorecards and template).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const interviews = await prisma.interview.findMany({
      where:   { applicationId: params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        scorecardTemplate: { select: { id: true, name: true, criteria: true } },
        scorecards:        { orderBy: { submittedAt: 'desc' } },
      },
    })
    return NextResponse.json({ interviews })
  } catch (err) {
    console.error('[recruitment interviews GET]', err)
    return NextResponse.json({ error: 'Failed to load interviews' }, { status: 500 })
  }
}

// POST — schedule an interview. Optionally emails the candidate the details
// (only after the interview is committed; a send failure never rolls back).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.interviews.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = validateInterviewInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const application = await prisma.jobApplication.findUnique({
      where:  { id: params.id },
      select: {
        id: true, reference: true, jobId: true, status: true,
        candidate: { select: { email: true, firstName: true, lastName: true } },
      },
    })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    if (application.status === 'withdrawn') {
      return NextResponse.json({ error: 'This application was withdrawn' }, { status: 400 })
    }
    if (parsed.value.scorecardTemplateId) {
      const template = await prisma.scorecardTemplate.findUnique({
        where: { id: parsed.value.scorecardTemplateId }, select: { id: true },
      })
      if (!template) return NextResponse.json({ error: 'Scorecard template not found' }, { status: 400 })
    }

    const interview = await prisma.interview.create({
      data: {
        applicationId: application.id,
        ...parsed.value,
        interviewers: parsed.value.interviewers,
        createdBy:    session.email,
      },
    })
    await recruitmentAudit(session, 'Interview Scheduled',
      `${application.reference}: ${parsed.value.kind}${parsed.value.scheduledAt ? ` at ${parsed.value.scheduledAt.toISOString()}` : ''}`)

    // Candidate notification — post-commit, best-effort, explicit opt-in.
    let notified = false
    if (body.notifyCandidate === true && parsed.value.scheduledAt) {
      try {
        const job = await prisma.jobOpening.findUnique({
          where: { id: application.jobId }, select: { title: true },
        })
        const when = parsed.value.scheduledAt.toLocaleString('en-GB', {
          dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos',
        })
        await getResend().emails.send({
          from:    NOTIFY_FROM,
          to:      application.candidate.email,
          subject: `Interview invitation — ${job?.title ?? 'Walz Travels'} (${application.reference})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#0B1F3A;font-size:18px;margin:0 0 12px">Interview invitation</h2>
            <p style="color:#555;font-size:14px">Dear ${escapeHtml(application.candidate.firstName)},</p>
            <p style="color:#555;font-size:14px">We would like to invite you to a ${escapeHtml(parsed.value.kind)} interview for the <strong>${escapeHtml(job?.title ?? 'role')}</strong> position.</p>
            <table style="width:100%;border-collapse:collapse;background:#f8f8f5;border-radius:8px;font-size:13px">
              <tr><td style="padding:8px 14px;color:#999;width:110px">When</td><td style="padding:8px 14px;color:#0B1F3A;font-weight:600">${escapeHtml(when)} (WAT)</td></tr>
              <tr><td style="padding:8px 14px;color:#999">Duration</td><td style="padding:8px 14px;color:#0B1F3A">${parsed.value.durationMins} minutes</td></tr>
              ${parsed.value.meetingUrl ? `<tr><td style="padding:8px 14px;color:#999">Join</td><td style="padding:8px 14px"><a href="${escapeHtml(parsed.value.meetingUrl)}" style="color:#C9A84C">${escapeHtml(parsed.value.meetingUrl)}</a></td></tr>` : ''}
              ${parsed.value.location ? `<tr><td style="padding:8px 14px;color:#999">Location</td><td style="padding:8px 14px;color:#0B1F3A">${escapeHtml(parsed.value.location)}</td></tr>` : ''}
              <tr><td style="padding:8px 14px;color:#999">Reference</td><td style="padding:8px 14px;color:#0B1F3A;font-family:monospace">${escapeHtml(application.reference)}</td></tr>
            </table>
            <p style="color:#555;font-size:13px;margin-top:16px">If this time does not work for you, or you need any accommodation, simply reply to this email and we will arrange an alternative.</p>
            <p style="color:#999;font-size:12px;margin-top:16px">Walz Travels Recruitment</p>
          </div>`,
        })
        notified = true
      } catch (err) {
        console.error('[recruitment interviews] candidate notify failed for', interview.id,
          err instanceof Error ? err.message : 'send error')
      }
    }
    return NextResponse.json({ interview, notified })
  } catch (err) {
    console.error('[recruitment interviews POST]', err)
    return NextResponse.json({ error: 'Failed to schedule interview' }, { status: 500 })
  }
}
