import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import {
  validateJob, hasRecruitmentPermission, recruitmentAudit,
  STATUS_TRANSITIONS, DEFAULT_PIPELINE_STAGES, ensureUniqueSlug,
  type JobStatus,
} from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// ── GET — full job detail incl. questions + stages ───────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const job = await prisma.jobOpening.findUnique({
      where: { id: params.id },
      include: {
        screeningQuestions: { orderBy: { sortOrder: 'asc' } },
        pipelineStages:     { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[recruitment job GET]', err)
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 })
  }
}

// ── PATCH — edit fields ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.jobs.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateJob(body, true)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (Object.keys(v.value).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }
    const job = await prisma.jobOpening.update({
      where: { id: params.id },
      data:  v.value as never,
      select: { id: true, title: true, slug: true, status: true },
    })
    await recruitmentAudit(session, 'Job Updated', `${job.title}: ${Object.keys(v.value).join(', ')}`)
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[recruitment job PATCH]', err)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

// ── POST — lifecycle actions: publish|pause|close|archive|reopen|duplicate ───
const ACTION_TO_STATUS: Record<string, JobStatus> = {
  publish: 'published', pause: 'paused', close: 'closed',
  archive: 'archived', reopen: 'published', restore: 'draft',
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.jobs.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as { action?: string }
  const action = body.action ?? ''

  try {
    const job = await prisma.jobOpening.findUnique({
      where: { id: params.id },
      include: { screeningQuestions: true },
    })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (action === 'duplicate') {
      const slug = await ensureUniqueSlug(`${job.title} copy`)
      const copy = await prisma.jobOpening.create({
        data: {
          title: `${job.title} (copy)`, slug,
          jobRef: `WALZ-JOB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          department: job.department, type: job.type, workplaceType: job.workplaceType,
          location: job.location, compensationType: job.compensationType,
          compensationMin: job.compensationMin, compensationMax: job.compensationMax,
          currency: job.currency, description: job.description,
          responsibilities: job.responsibilities, requirements: job.requirements,
          benefits: job.benefits, applicationInstructions: job.applicationInstructions,
          positions: job.positions, screeningSettings: job.screeningSettings as never,
          aiDisclosure: job.aiDisclosure, hiringManager: job.hiringManager,
          recruiters: job.recruiters as never,
          status: 'draft', isActive: false, createdBy: session.email,
          sortOrder: job.sortOrder + 1,
          screeningQuestions: {
            create: job.screeningQuestions.map(q => ({
              question: q.question, kind: q.kind, required: q.required,
              options: q.options as never, sortOrder: q.sortOrder,
            })),
          },
          pipelineStages: {
            create: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
              key: s.key, label: s.label, sortOrder: i + 1, isSystem: true,
            })),
          },
        },
        select: { id: true, slug: true, title: true },
      })
      await recruitmentAudit(session, 'Job Duplicated', `${job.title} → ${copy.title}`)
      return NextResponse.json({ job: copy })
    }

    const target = ACTION_TO_STATUS[action]
    if (!target) return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })

    const allowed = STATUS_TRANSITIONS[job.status as JobStatus] ?? []
    if (!allowed.includes(target)) {
      return NextResponse.json(
        { error: `Cannot ${action} a ${job.status} job (allowed: ${allowed.join(', ') || 'none'})` },
        { status: 400 },
      )
    }

    const updated = await prisma.jobOpening.update({
      where: { id: params.id },
      data: {
        status:      target,
        isActive:    target === 'published',   // legacy flag kept in sync
        publishedAt: target === 'published' ? (job.publishedAt ?? new Date()) : job.publishedAt,
        archivedAt:  target === 'archived' ? new Date() : null,
      },
      select: { id: true, title: true, status: true },
    })
    await recruitmentAudit(session, 'Job Status Changed', `${updated.title}: ${job.status} → ${target}`)
    return NextResponse.json({ job: updated })
  } catch (err) {
    console.error('[recruitment job action]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
