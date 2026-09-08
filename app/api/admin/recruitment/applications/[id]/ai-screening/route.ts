import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { runAiScreening } from '@/lib/recruitment/ai-screening'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET — screening results for an application (newest first).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const results = await prisma.aiScreeningResult.findMany({
      where:   { applicationId: params.id },
      orderBy: { createdAt: 'desc' },
      take:    10,
    })
    return NextResponse.json({ results })
  } catch (err) {
    console.error('[ai-screening GET]', err)
    return NextResponse.json({ error: 'Failed to load screening results' }, { status: 500 })
  }
}

// POST — a human triggers one advisory screening run. Never automatic,
// never a decision: the run stores an advisory result and nothing else.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.ai.review')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const limited = rateLimit({ key: `ai-screening:${session.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!limited.allowed) {
    return NextResponse.json({ error: 'Too many screening runs — try again later' }, { status: 429 })
  }
  try {
    const result = await runAiScreening(session, params.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, resultId: result.resultId })
  } catch (err) {
    console.error('[ai-screening POST]', err)
    return NextResponse.json({ error: 'Screening failed' }, { status: 500 })
  }
}

// PATCH — a human marks a screening result as reviewed (identity from session).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.ai.review')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body.resultId !== 'string' || !body.resultId) {
      return NextResponse.json({ error: 'resultId is required' }, { status: 400 })
    }
    const existing = await prisma.aiScreeningResult.findFirst({
      where:  { id: body.resultId, applicationId: params.id },
      select: { id: true, reviewedBy: true },
    })
    if (!existing) return NextResponse.json({ error: 'Screening result not found' }, { status: 404 })
    if (existing.reviewedBy) {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
    }
    const result = await prisma.aiScreeningResult.update({
      where: { id: existing.id },
      data:  { reviewedBy: session.email, reviewedAt: new Date() },
    })
    await recruitmentAudit(session, 'AI Screening Reviewed', `result ${existing.id}`)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[ai-screening PATCH]', err)
    return NextResponse.json({ error: 'Failed to mark reviewed' }, { status: 500 })
  }
}
