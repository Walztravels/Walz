import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// GET — candidate profile: identity, every application (with job titles
// resolved), documents and internal notes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: params.id },
      include: {
        applications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, reference: true, jobId: true, stageKey: true, status: true,
            createdAt: true, howHeard: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, kind: true, filename: true, size: true, createdAt: true, applicationId: true },
        },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    const jobIds = Array.from(new Set(candidate.applications.map((a: { jobId: string }) => a.jobId)))
    const jobs = jobIds.length > 0
      ? await prisma.jobOpening.findMany({
          where:  { id: { in: jobIds } },
          select: { id: true, title: true, slug: true, department: true },
        })
      : []
    return NextResponse.json({ candidate, jobs })
  } catch (err) {
    console.error('[recruitment candidate GET]', err)
    return NextResponse.json({ error: 'Failed to load candidate' }, { status: 500 })
  }
}
