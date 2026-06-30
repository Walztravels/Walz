import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { can } from '@/lib/permissions-registry'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

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

  const familyOnly = searchParams.get('family') === 'true'

  const where: Record<string, unknown> = { isDraft: false }
  if (status && status !== 'all')           where.status          = status
  if (destination && destination !== 'all') where.destinationIso2 = destination
  if (assignedTo && assignedTo !== 'all')   where.assignedTo      = assignedTo === 'unassigned' ? null : assignedTo
  if (familyOnly)                           where.familyGroupId   = { not: null }

  if (!can(session, 'visa_view_all')) {
    const staffEmail = session.email
    if (!where.assignedTo) {
      where.OR = [
        { assignedTo: staffEmail },
        { initiatedBy: staffEmail },
      ]
    }
  }

  try {
    const applications = await prisma.visaApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    500,
      select: {
        id:             true,
        referenceNumber: true,
        destinationIso2: true,
        visaType:       true,
        firstName:      true,
        lastName:       true,
        email:          true,
        phone:          true,
        status:         true,
        serviceFeePaid: true,
        assignedTo:     true,
        initiatedBy:    true,
        isDraft:        true,
        familyGroupId:  true,
        relationship:   true,
        isMinor:        true,
        createdAt:      true,
        updatedAt:      true,
        user:  { select: { name: true, email: true } },
        notes: { select: { content: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    const filtered = search
      ? applications.filter(a =>
          `${a.firstName} ${a.lastName} ${a.referenceNumber} ${a.email}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
      : applications

    return NextResponse.json({ applications: filtered })
  } catch (err: any) {
    console.error('[visa-applications GET]:', err.message)
    return NextResponse.json({ error: err.message, applications: [] }, { status: 500 })
  }
}
