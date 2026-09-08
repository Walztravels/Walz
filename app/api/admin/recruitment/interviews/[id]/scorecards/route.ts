import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { scoreSubmission, RECOMMENDATIONS, type ScorecardCriterion } from '@/lib/recruitment/interviews'

export const dynamic = 'force-dynamic'

// POST — submit the signed-in staff member's scorecard for an interview.
// One per reviewer per interview; the reviewer identity is always the
// session, never client-supplied. The weighted overall is computed
// server-side from the template criteria.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Any authenticated staff member may score an interview they conducted.
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const interview = await prisma.interview.findUnique({
      where:  { id: params.id },
      select: {
        id: true, applicationId: true, status: true,
        scorecardTemplate: { select: { criteria: true, name: true } },
      },
    })
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    if (!interview.scorecardTemplate) {
      return NextResponse.json({ error: 'This interview has no scorecard template attached' }, { status: 400 })
    }
    if (interview.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot score a cancelled interview' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    if (!(RECOMMENDATIONS as readonly string[]).includes(body.recommendation)) {
      return NextResponse.json({ error: `recommendation must be one of: ${RECOMMENDATIONS.join(', ')}` }, { status: 400 })
    }
    const criteria = interview.scorecardTemplate.criteria as unknown as ScorecardCriterion[]
    const result = scoreSubmission(criteria, body.scores)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    const existing = await prisma.interviewScorecard.findUnique({
      where: { interviewId_reviewerEmail: { interviewId: interview.id, reviewerEmail: session.email } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'You have already submitted a scorecard for this interview' }, { status: 409 })
    }

    const scorecard = await prisma.interviewScorecard.create({
      data: {
        interviewId:    interview.id,
        applicationId:  interview.applicationId,
        reviewerEmail:  session.email,
        reviewerName:   session.name ?? null,
        scores:         JSON.parse(JSON.stringify(result.scores)),
        overallScore:   result.overall,
        recommendation: body.recommendation,
        comment: typeof body.comment === 'string' && body.comment.trim()
          ? body.comment.trim().slice(0, 5000)
          : null,
      },
    })
    await recruitmentAudit(session, 'Scorecard Submitted',
      `interview ${interview.id}: ${result.overall}/100, ${body.recommendation}`)
    return NextResponse.json({ scorecard })
  } catch (err) {
    console.error('[recruitment scorecard POST]', err)
    return NextResponse.json({ error: 'Failed to submit scorecard' }, { status: 500 })
  }
}
