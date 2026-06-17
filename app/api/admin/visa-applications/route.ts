import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statsOnly   = searchParams.get('stats') === 'true'
  const status      = searchParams.get('status')      // filter by status
  const destination = searchParams.get('destination')  // filter by ISO2
  const assignedTo  = searchParams.get('assignedTo')
  const search      = searchParams.get('search')

  // Return aggregate counts only
  if (statsOnly) {
    const baseWhere = { isDraft: false }
    const inProgressStatuses = ['documents_pending', 'under_review', 'ready_to_submit', 'submitted_to_embassy', 'decision_pending']
    const [total, submittedToEmbassy, inProgress, approved] = await Promise.all([
      prisma.visaApplication.count({ where: baseWhere }),
      prisma.visaApplication.count({ where: { ...baseWhere, status: 'submitted_to_embassy' } }),
      prisma.visaApplication.count({ where: { ...baseWhere, status: { in: inProgressStatuses } } }),
      prisma.visaApplication.count({ where: { ...baseWhere, status: 'approved' } }),
    ])
    return NextResponse.json({ stats: { total, submittedToEmbassy, inProgress, approved } })
  }

  const where: Record<string, unknown> = { isDraft: false }
  if (status && status !== 'all')           where.status          = status
  if (destination && destination !== 'all') where.destinationIso2 = destination
  if (assignedTo && assignedTo !== 'all')   where.assignedTo      = assignedTo === 'unassigned' ? null : assignedTo

  const applications = await prisma.visaApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      notes: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  // Client-side search filter (name / reference)
  const filtered = search
    ? applications.filter(a =>
        `${a.firstName} ${a.lastName} ${a.referenceNumber} ${a.email}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : applications

  return NextResponse.json({ applications: filtered })
}
