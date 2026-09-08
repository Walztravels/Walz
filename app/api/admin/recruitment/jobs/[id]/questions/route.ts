import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

const QUESTION_KINDS = ['text', 'boolean', 'select']

// PUT — replace the job's screening-question set atomically.
// Body: { questions: [{ question, kind, required, options, sortOrder }] }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.jobs.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({})) as { questions?: unknown[] }
    const raw = Array.isArray(body.questions) ? body.questions : null
    if (!raw) return NextResponse.json({ error: 'questions array required' }, { status: 400 })
    if (raw.length > 25) return NextResponse.json({ error: 'Maximum 25 screening questions' }, { status: 400 })

    const questions: Array<{ question: string; kind: string; required: boolean; options: string[]; sortOrder: number }> = []
    for (const [i, q] of raw.entries()) {
      const item = q as Record<string, unknown>
      const text = typeof item.question === 'string' ? item.question.trim() : ''
      if (!text || text.length > 1000) return NextResponse.json({ error: `Question ${i + 1}: text required (max 1000 chars)` }, { status: 400 })
      const kind = QUESTION_KINDS.includes(item.kind as string) ? item.kind as string : 'text'
      const options = Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string').slice(0, 12) : []
      if (kind === 'select' && options.length < 2) {
        return NextResponse.json({ error: `Question ${i + 1}: select questions need at least 2 options` }, { status: 400 })
      }
      questions.push({ question: text, kind, required: item.required === true, options, sortOrder: i + 1 })
    }

    const job = await prisma.jobOpening.findUnique({ where: { id: params.id }, select: { id: true, title: true } })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    await prisma.$transaction([
      prisma.jobScreeningQuestion.deleteMany({ where: { jobId: params.id } }),
      prisma.jobScreeningQuestion.createMany({
        data: questions.map(q => ({ ...q, jobId: params.id, options: q.options as never })),
      }),
    ])
    await recruitmentAudit(session, 'Screening Questions Updated', `${job.title}: ${questions.length} questions`)
    return NextResponse.json({ ok: true, count: questions.length })
  } catch (err) {
    console.error('[recruitment questions PUT]', err)
    return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 })
  }
}
