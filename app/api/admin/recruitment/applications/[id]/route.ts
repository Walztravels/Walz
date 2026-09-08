import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission } from '@/lib/recruitment/core'
import { moveApplicationStage } from '@/lib/recruitment/pipeline'

export const dynamic = 'force-dynamic'

// GET — full application detail: candidate, job context, answers, documents,
// stage timeline and internal notes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const application = await prisma.jobApplication.findUnique({
      where: { id: params.id },
      include: {
        candidate:    true,
        answers:      { orderBy: { id: 'asc' } },
        documents:    { select: { id: true, kind: true, filename: true, contentType: true, size: true, createdAt: true } },
        stageHistory: { orderBy: { createdAt: 'desc' } },
        notes:        { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    // jobId is a plain reference (applications survive job removal) — resolve separately.
    const job = await prisma.jobOpening.findUnique({
      where:  { id: application.jobId },
      select: {
        id: true, title: true, slug: true, department: true,
        pipelineStages: { orderBy: { sortOrder: 'asc' }, select: { key: true, label: true } },
      },
    })
    // Never leak the raw status token hash to the browser.
    const { statusTokenHash: _hash, ...safe } = application
    return NextResponse.json({ application: safe, job })
  } catch (err) {
    console.error('[recruitment application GET]', err)
    return NextResponse.json({ error: 'Failed to load application' }, { status: 500 })
  }
}

// POST — actions. { action: 'move', toStage, note? } moves the application to
// another pipeline stage; every move is history-logged and audited, and moves
// into offer/hired/rejected are recorded as human hiring decisions.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action !== 'move') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (typeof body.toStage !== 'string' || !body.toStage) {
      return NextResponse.json({ error: 'toStage is required' }, { status: 400 })
    }
    const result = await moveApplicationStage({
      session,
      applicationId: params.id,
      toKey: body.toStage,
      note:  typeof body.note === 'string' ? body.note : null,
    })
    if (!result.ok) {
      const status = result.code === 'forbidden' ? 403 : result.code === 'not_found' ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json({ ok: true, fromKey: result.fromKey, toKey: result.toKey, status: result.status })
  } catch (err) {
    console.error('[recruitment application POST]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
