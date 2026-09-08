import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// POST — add an internal note to an application (also linked to the candidate
// so it appears on their profile). Notes are internal-only, never candidate-visible.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!text || text.length > 5000) {
      return NextResponse.json({ error: 'Note text is required (max 5000 chars)' }, { status: 400 })
    }
    const application = await prisma.jobApplication.findUnique({
      where:  { id: params.id },
      select: { id: true, candidateId: true, reference: true },
    })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const note = await prisma.candidateNote.create({
      data: {
        candidateId:   application.candidateId,
        applicationId: application.id,
        authorEmail:   session.email,
        authorName:    session.name ?? null,
        body:          text,
      },
    })
    await recruitmentAudit(session, 'Note Added', `${application.reference}: note ${note.id}`)
    return NextResponse.json({ note })
  } catch (err) {
    console.error('[recruitment note POST]', err)
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })
  }
}
