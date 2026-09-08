import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { INTERVIEW_STATUSES } from '@/lib/recruitment/interviews'

export const dynamic = 'force-dynamic'

// PATCH — update an interview: status (completed/cancelled/no_show),
// reschedule, notes. Management action, audited.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.interviews.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const existing = await prisma.interview.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, applicationId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (body.status !== undefined) {
      if (!(INTERVIEW_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${INTERVIEW_STATUSES.join(', ')}` }, { status: 400 })
      }
      data.status = body.status
    }
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null || body.scheduledAt === '') data.scheduledAt = null
      else {
        const d = new Date(String(body.scheduledAt))
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'scheduledAt must be a valid date-time' }, { status: 400 })
        data.scheduledAt = d
      }
    }
    if (body.notes !== undefined) {
      data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 5000) : null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const interview = await prisma.interview.update({ where: { id: params.id }, data })
    await recruitmentAudit(session, 'Interview Updated',
      `interview ${params.id}: ${Object.keys(data).join(', ')}${data.status ? ` → ${data.status}` : ''}`)
    return NextResponse.json({ interview })
  } catch (err) {
    console.error('[recruitment interview PATCH]', err)
    return NextResponse.json({ error: 'Failed to update interview' }, { status: 500 })
  }
}
