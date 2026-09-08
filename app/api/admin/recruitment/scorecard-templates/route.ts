import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { validateCriteria } from '@/lib/recruitment/interviews'

export const dynamic = 'force-dynamic'

// GET — active scorecard templates (global + optionally job-scoped).
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const jobId = req.nextUrl.searchParams.get('jobId')
    const templates = await prisma.scorecardTemplate.findMany({
      where: {
        isActive: true,
        ...(jobId ? { OR: [{ jobId: null }, { jobId }] } : {}),
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[scorecard templates GET]', err)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

// POST — create a scorecard template (management only; weights must sum to 100).
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!validateCriteria(body.criteria)) {
      return NextResponse.json({ error: 'criteria must be 1–20 weighted entries with unique keys, weights summing to 100' }, { status: 400 })
    }
    const template = await prisma.scorecardTemplate.create({
      data: {
        name,
        jobId:    typeof body.jobId === 'string' && body.jobId ? body.jobId : null,
        criteria: JSON.parse(JSON.stringify(body.criteria)),
      },
    })
    await recruitmentAudit(session, 'Scorecard Template Created', `${template.id}: ${name}`)
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[scorecard templates POST]', err)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
