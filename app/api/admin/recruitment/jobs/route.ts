import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import {
  validateJob, ensureUniqueSlug, hasRecruitmentPermission,
  recruitmentAudit, DEFAULT_PIPELINE_STAGES,
} from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/recruitment/jobs — every job, all statuses ────────────────
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const jobs = await prisma.jobOpening.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, slug: true, title: true, department: true, type: true,
        workplaceType: true, location: true, status: true, deadline: true,
        sortOrder: true, positions: true, hiringManager: true,
        publishedAt: true, createdAt: true, updatedAt: true,
      },
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[recruitment jobs GET]', err)
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }
}

// ── POST /api/admin/recruitment/jobs — create (draft by default) ─────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.jobs.manage')) {
    return NextResponse.json({ error: 'Forbidden — recruitment management role required' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateJob(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const slug   = await ensureUniqueSlug(v.value.title as string)
    const year   = new Date().getFullYear()
    const jobRef = `WALZ-JOB-${year}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const job = await prisma.jobOpening.create({
      data: {
        ...(v.value as object),
        slug,
        jobRef,
        status:    'draft',
        isActive:  false,
        createdBy: session.email,
        // Default pipeline stages created atomically with the job
        pipelineStages: {
          create: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
            key: s.key, label: s.label, sortOrder: i + 1, isSystem: true,
          })),
        },
      } as never,
      select: { id: true, slug: true, title: true, status: true },
    })

    await recruitmentAudit(session, 'Job Created', `${job.title} (${job.slug}) as draft`)
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[recruitment jobs POST]', err)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}
