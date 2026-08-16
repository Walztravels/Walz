import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; issueId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { status?: string }
  const { status } = body

  const allowed = ['open', 'task_created', 'fix_applied', 'dismissed']
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${allowed.join(', ')}` }, { status: 400 })
  }

  const issue = await prisma.orbitAuditIssue.findFirst({
    where: { id: params.issueId, auditId: params.id },
  })
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  const updated = await prisma.orbitAuditIssue.update({
    where: { id: params.issueId },
    data: {
      status,
      approvedBy: status === 'fix_applied' ? session.email : issue.approvedBy,
      approvedAt: status === 'fix_applied' ? now : issue.approvedAt,
      fixedAt:    status === 'fix_applied' ? now : issue.fixedAt,
    },
  })

  await prisma.orbitAuditLog.create({
    data: {
      auditId:  params.id,
      issueId:  params.issueId,
      action:   `issue_${status}`,
      actor:    session.email,
      detail:   { previousStatus: issue.status, newStatus: status },
    },
  })

  return NextResponse.json({ issue: updated })
}
