import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { inviteAiInterview, AI_INTERVIEW_TOKEN_TTL_DAYS } from '@/lib/recruitment/ai-interview'

export const dynamic = 'force-dynamic'

const NOTIFY_FROM = 'Walz Travels <hello@walztravels.com>'
const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.walztravels.com'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// GET — AI interviews for one application (transcript + advisory summary,
// staff view; the raw token is never stored so it can never be re-read).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const interviews = await prisma.aiInterview.findMany({
      where:   { applicationId: params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, tokenExpiresAt: true, currentIndex: true,
        questions: true, transcript: true, aiSummary: true, aiHighlights: true,
        reviewedBy: true, reviewedAt: true, invitedBy: true,
        startedAt: true, completedAt: true, createdAt: true,
      },
    })
    return NextResponse.json({ interviews })
  } catch (err) {
    console.error('[ai-interview GET]', err)
    return NextResponse.json({ error: 'Failed to load AI interviews' }, { status: 500 })
  }
}

// POST — invite the candidate to an AI screening interview. The invitation
// email (with the one-time link) is sent only after the interview is
// committed; a send failure is reported but never rolls back.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.interviews.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const result = await inviteAiInterview(
      session, params.id,
      typeof body.questionSetId === 'string' && body.questionSetId ? body.questionSetId : null,
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    const link = `${BASE_URL}/careers/interview/${result.token}`
    let emailed = false
    try {
      await getResend().emails.send({
        from:    NOTIFY_FROM,
        to:      result.candidateEmail,
        subject: `Your Walz Travels screening interview (${result.reference})`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="color:#0B1F3A;font-size:18px;margin:0 0 12px">Screening interview invitation</h2>
          <p style="color:#555;font-size:14px">Dear ${escapeHtml(result.firstName)},</p>
          <p style="color:#555;font-size:14px">Thank you for applying to Walz Travels. The next step is a short <strong>written screening interview</strong> you can complete online at your own pace.</p>
          <p style="color:#555;font-size:13px">A note on how this works: your written answers are collected with the help of artificial intelligence and summarized for our recruitment team. <strong>AI does not make hiring decisions</strong> — every answer is read by a person, and all hiring decisions are made by authorized Walz Travels staff. No audio or video is recorded. If you would prefer a human-led interview or need any accommodation, just reply to this email.</p>
          <a href="${link}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">Start your interview →</a>
          <p style="color:#999;font-size:12px;margin-top:16px">This personal link expires in ${AI_INTERVIEW_TOKEN_TTL_DAYS} days. Reference: <span style="font-family:monospace">${escapeHtml(result.reference)}</span></p>
        </div>`,
      })
      emailed = true
    } catch (err) {
      console.error('[ai-interview] invite email failed for', result.interviewId,
        err instanceof Error ? err.message : 'send error')
    }
    return NextResponse.json({ ok: true, interviewId: result.interviewId, emailed })
  } catch (err) {
    console.error('[ai-interview POST]', err)
    return NextResponse.json({ error: 'Failed to create AI interview' }, { status: 500 })
  }
}

// PATCH — cancel an open interview, or mark a completed one human-reviewed.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.interviews.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const interviewId = typeof body.interviewId === 'string' ? body.interviewId : ''
    const action      = typeof body.action === 'string' ? body.action : ''
    const iv = await prisma.aiInterview.findFirst({
      where:  { id: interviewId, applicationId: params.id },
      select: { id: true, status: true, reviewedBy: true },
    })
    if (!iv) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

    if (action === 'cancel') {
      if (iv.status === 'completed') return NextResponse.json({ error: 'Completed interviews cannot be cancelled' }, { status: 400 })
      await prisma.aiInterview.update({ where: { id: iv.id }, data: { status: 'cancelled' } })
      await recruitmentAudit(session, 'AI Interview Cancelled', `interview ${iv.id}`)
      return NextResponse.json({ ok: true })
    }
    if (action === 'review') {
      if (iv.status !== 'completed') return NextResponse.json({ error: 'Only completed interviews can be marked reviewed' }, { status: 400 })
      if (iv.reviewedBy) return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
      await prisma.aiInterview.update({
        where: { id: iv.id },
        data:  { reviewedBy: session.email, reviewedAt: new Date() },
      })
      await recruitmentAudit(session, 'AI Interview Reviewed', `interview ${iv.id}`)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[ai-interview PATCH]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
