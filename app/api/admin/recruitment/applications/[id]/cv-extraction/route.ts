import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { runCvExtraction, getLatestExtraction, EXTRACTION_FAILURE_MESSAGES } from '@/lib/recruitment/cv-extraction'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
// OCR of a multi-page scanned PDF can exceed the default budget.
export const maxDuration = 120

/**
 * CV text extraction for one application.
 *
 * GET  — extraction status METADATA only (status, method, timings, counts,
 *        safe failure message). The extracted text itself is server-only:
 *        it is never returned here and never appears in any list API —
 *        the screening engine reads it server-side.
 * POST — run/retry extraction. body.mode:
 *          'native' (default) — fast text extraction; returns needs_ocr
 *                               when the document is scanned/image-only
 *          'ocr'              — continue with OCR (explicit, since it is
 *                               a paid provider call)
 *          'full'             — whole ladder in one call
 *        body.force reruns even when a completed result exists.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired — please sign in again.' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Your role does not include recruitment access.' }, { status: 403 })
  }
  const row = await getLatestExtraction(params.id)
  if (!row) return NextResponse.json({ ok: true, extraction: null })
  return NextResponse.json({
    ok: true,
    extraction: {
      id:           row.id,
      status:       row.status,
      method:       row.method,
      pageCount:    row.pageCount,
      charCount:    row.charCount,
      failureCode:  row.failureCode,
      message:      row.failureCode ? EXTRACTION_FAILURE_MESSAGES[row.failureCode as keyof typeof EXTRACTION_FAILURE_MESSAGES] ?? null : null,
      mimeStored:   row.mimeStored,
      mimeDetected: row.mimeDetected,
      extractorVersion: row.extractorVersion,
      createdAt:    row.createdAt,
      completedAt:  row.completedAt,
      // NO text field — server-only.
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired — please sign in again.' }, { status: 401 })
  // OCR is a paid provider call — same permission gate as running screening.
  if (!hasRecruitmentPermission(session, 'recruitment.ai.review')) {
    return NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Your role does not include AI screening review.' }, { status: 403 })
  }
  const limited = rateLimit({ key: `cv-extraction:${session.id}`, limit: 30, windowMs: 60 * 60 * 1000 })
  if (!limited.allowed) {
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED', message: 'Too many extraction runs — try again later.' }, { status: 429 })
  }
  try {
    const body = await req.json().catch(() => ({})) as { mode?: 'native' | 'ocr' | 'full'; force?: boolean }
    const mode = body.mode === 'ocr' ? 'ocr' : body.mode === 'full' ? 'full' : 'native'
    const outcome = await runCvExtraction({
      applicationId: params.id,
      requestedBy:   session.email,
      force:         Boolean(body.force),
      mode,
    })
    await recruitmentAudit(session, 'CV Extraction Run',
      `application ${params.id}: ${outcome.status}${outcome.method ? ` (${outcome.method})` : ''}${outcome.failureCode ? ` — ${outcome.failureCode}` : ''}`)
    // Metadata only — the text stays server-side.
    const { text: _text, ...meta } = outcome
    return NextResponse.json({ ok: outcome.status !== 'failed', ...meta })
  } catch (err) {
    console.error('[cv-extraction POST]', err instanceof Error ? err.message.slice(0, 160) : err)
    return NextResponse.json(
      { ok: false, code: 'EXTRACTION_FAILED', message: 'The CV could not be read. Please try again.' },
      { status: 500 },
    )
  }
}
