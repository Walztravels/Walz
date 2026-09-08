import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// GET — the talent pool with candidate summaries (newest first).
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const entries = await prisma.talentPoolEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take:    500,
    })
    const candidates = entries.length > 0
      ? await prisma.candidate.findMany({
          where:  { id: { in: entries.map((e: { candidateId: string }) => e.candidateId) } },
          select: { id: true, firstName: true, lastName: true, email: true, country: true },
        })
      : []
    return NextResponse.json({ entries, candidates })
  } catch (err) {
    console.error('[talent-pool GET]', err)
    return NextResponse.json({ error: 'Failed to load talent pool' }, { status: 500 })
  }
}

// POST — add a candidate to the pool (management; idempotent per candidate).
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : ''
    if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId }, select: { id: true, email: true },
    })
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    const existing = await prisma.talentPoolEntry.findUnique({
      where: { candidateId }, select: { id: true },
    })
    if (existing) return NextResponse.json({ error: 'Candidate is already in the talent pool' }, { status: 409 })

    const entry = await prisma.talentPoolEntry.create({
      data: {
        candidateId,
        addedBy: session.email,
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null,
        sourceApplicationId: typeof body.sourceApplicationId === 'string' && body.sourceApplicationId ? body.sourceApplicationId : null,
      },
    })
    await recruitmentAudit(session, 'Talent Pool Added', `candidate ${candidateId} (${candidate.email})`)
    return NextResponse.json({ entry })
  } catch (err) {
    console.error('[talent-pool POST]', err)
    return NextResponse.json({ error: 'Failed to add to talent pool' }, { status: 500 })
  }
}

// DELETE — remove a candidate (management; also how candidate removal
// requests are honoured). Audited.
export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : ''
    if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
    const existing = await prisma.talentPoolEntry.findUnique({
      where: { candidateId }, select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Candidate is not in the talent pool' }, { status: 404 })
    await prisma.talentPoolEntry.delete({ where: { candidateId } })
    await recruitmentAudit(session, 'Talent Pool Removed', `candidate ${candidateId}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[talent-pool DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove from talent pool' }, { status: 500 })
  }
}
