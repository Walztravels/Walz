import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// GET — applications for one job (candidate summary, stage, documents)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const applications = await prisma.jobApplication.findMany({
      where:   { jobId: params.id },
      orderBy: { createdAt: 'desc' },
      take:    200,
      select: {
        id: true, reference: true, stageKey: true, status: true, createdAt: true,
        howHeard: true, accommodation: true,
        candidate: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, country: true } },
        documents: { select: { id: true, kind: true, filename: true, size: true } },
        _count:    { select: { answers: true } },
      },
    })
    return NextResponse.json({ applications })
  } catch (err) {
    console.error('[recruitment applications GET]', err)
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
  }
}
