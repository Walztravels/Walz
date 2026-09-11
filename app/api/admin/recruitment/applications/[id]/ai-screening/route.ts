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
  if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired — please sign in again.', error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Your role does not include AI screening review.', error: 'Forbidden' }, { status: 403 })
  }
  try {
    let results
    try {
      results = await prisma.aiScreeningResult.findMany({
        where:   { applicationId: params.id },
        orderBy: { createdAt: 'desc' },
        take:    10,
      })
    } catch (colErr) {
      // Pre-migration fallback: screeningSource column not present yet —
      // select the legacy columns and derive the source from cvUsed so the
      // UI can still label every result correctly.
      if (!(colErr instanceof Error && /screeningSource|column/i.test(colErr.message))) throw colErr
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "id","applicationId","model","promptVersion","status","summary","strengths","concerns",
               "suggestedQuestions","matchScore","cvUsed","error","requestedBy","reviewedBy","reviewedAt","createdAt"
        FROM "AiScreeningResult" WHERE "applicationId" = ${params.id}
        ORDER BY "createdAt" DESC LIMIT 10`
      results = rows.map(r => ({ ...r, screeningSource: r.cvUsed ? 'CV_AND_APPLICATION' : 'APPLICATION_ANSWERS_ONLY' }))
    }
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
  if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired — please sign in again.', error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.ai.review')) {
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Your role does not include AI screening review.', error: 'Forbidden' }, { status: 403 })
  }
  const limited = rateLimit({ key: `ai-screening:${session.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many screening runs — try again later', message: 'Too many screening runs — try again later' },
      { status: 429 },
    )
  }
  try {
    // Answers-only (partial) screening is a deliberate staff choice: it runs
    // ONLY when the request explicitly confirms it — never as a silent
    // fallback when the CV cannot be read.
    const body = await req.json().catch(() => ({})) as { confirmAnswersOnly?: boolean }
    const result = await runAiScreening(session, params.id, {
      allowAnswersOnly: body.confirmAnswersOnly === true,
    })
    if (!result.ok) {
      // Structured, user-safe error: { ok, code, message } (+ legacy `error`).
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message, error: result.message,
          ...(result.cvStatus ? { cvStatus: result.cvStatus, cvMessage: result.cvMessage } : {}) },
        { status: result.status },
      )
    }
    return NextResponse.json({ ok: true, resultId: result.resultId, cvStatus: result.cvStatus, cvMessage: result.cvMessage, screeningSource: result.screeningSource })
  } catch (err) {
    console.error('[ai-screening POST]', err)
    return NextResponse.json(
      { ok: false, code: 'DATABASE_ERROR', message: 'Screening failed unexpectedly. Please try again.', error: 'Screening failed unexpectedly. Please try again.' },
      { status: 500 },
    )
  }
}

// PATCH — a human marks a screening result as reviewed (identity from session).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired — please sign in again.', error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.ai.review')) {
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Your role does not include AI screening review.', error: 'Forbidden' }, { status: 403 })
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
