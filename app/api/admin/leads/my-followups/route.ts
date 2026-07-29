import { NextRequest, NextResponse } from 'next/server'
import { prisma }          from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['New', 'Contacted', 'In Progress']

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const week  = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const base = {
    assignedToId: session.id,
    status:       { in: ACTIVE_STATUSES },
  }

  const [overdue, todayLeads, upcoming, noDate] = await Promise.all([
    // Overdue: nextFollowUpAt is before today
    prisma.lead.findMany({
      where:   { ...base, nextFollowUpAt: { lt: today } },
      orderBy: { nextFollowUpAt: 'asc' },
      take:    50,
    }),
    // Today: nextFollowUpAt is exactly today (midnight → midnight+1d)
    prisma.lead.findMany({
      where:   { ...base, nextFollowUpAt: { gte: today, lt: new Date(today.getTime() + 86_400_000) } },
      orderBy: { nextFollowUpAt: 'asc' },
      take:    50,
    }),
    // Upcoming: next 7 days (excludes today)
    prisma.lead.findMany({
      where:   { ...base, nextFollowUpAt: { gte: new Date(today.getTime() + 86_400_000), lt: week } },
      orderBy: { nextFollowUpAt: 'asc' },
      take:    50,
    }),
    // No date: assigned + active but no follow-up scheduled
    prisma.lead.findMany({
      where:   { ...base, nextFollowUpAt: null },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take:    100,
    }),
  ])

  return NextResponse.json({ overdue, today: todayLeads, upcoming, noDate })
}
