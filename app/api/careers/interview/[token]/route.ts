import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import {
  findInterviewByToken, candidateState, submitInterviewAnswer,
  isExpired, AI_INTERVIEW_NOTICE, ANSWER_MAX_CHARS,
} from '@/lib/recruitment/ai-interview'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Public, token-gated candidate interview API. The candidate sees only
// their own progress, the current question, the AI notice, their first
// name and the role title — nothing else about the application.

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// GET — current interview state for the candidate.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit({ key: `ai-interview-state:${clientIp(req)}`, limit: 60, windowMs: 60 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    const iv = await findInterviewByToken(params.token)
    if (!iv) return NextResponse.json({ error: 'This interview link is not valid' }, { status: 404 })
    if (iv.status !== 'completed' && iv.status !== 'cancelled' && isExpired(iv)) {
      return NextResponse.json({ error: 'This interview link has expired — contact us to get a new one' }, { status: 410 })
    }
    const application = await prisma.jobApplication.findUnique({
      where:  { id: iv.applicationId },
      select: { jobId: true, candidate: { select: { firstName: true } } },
    })
    const job = application
      ? await prisma.jobOpening.findUnique({ where: { id: application.jobId }, select: { title: true } })
      : null
    return NextResponse.json({
      state:      candidateState(iv),
      firstName:  application?.candidate.firstName ?? '',
      jobTitle:   job?.title ?? '',
      notice:     AI_INTERVIEW_NOTICE,
      answerMax:  ANSWER_MAX_CHARS,
    })
  } catch (err) {
    console.error('[careers interview GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// POST — submit the answer to the current question.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit({ key: `ai-interview-answer:${clientIp(req)}`, limit: 40, windowMs: 60 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests — please slow down' }, { status: 429 })
  try {
    const body = await req.json().catch(() => ({}))
    const result = await submitInterviewAnswer(params.token, body.answer)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    const iv = await findInterviewByToken(params.token)
    return NextResponse.json({
      ok: true,
      completed: result.completed,
      state: iv ? candidateState(iv) : null,
    })
  } catch (err) {
    console.error('[careers interview POST]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
