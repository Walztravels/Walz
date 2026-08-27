// Admin Recovery Center API — list opportunities (Release 3A)
//
// GET /api/admin/recovery?status=OPEN&priority=URGENT&type=SUPPLIER_FAILURE&assignedToId=xxx&window=30
//
// Security: requires admin session.
// RBAC: staff see only opportunities assigned to them; super_admin/GM/ops see all.
// Currency: never summed — grouped in response.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { canSeeAllRecords }         from '@/lib/admin/permissions'
import prisma                       from '@/lib/db'

export const dynamic = 'force-dynamic'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusFilter     = searchParams.get('status')     ?? 'OPEN'
  const priorityFilter   = searchParams.get('priority')   ?? null
  const typeFilter       = searchParams.get('type')       ?? null
  const assignedToFilter = searchParams.get('assignedToId') ?? null
  const windowDays       = parseInt(searchParams.get('window') ?? '30', 10)
  const since            = daysAgo(windowDays)

  // RBAC: staff can only see their own assignments unless they have cross-record visibility
  const canSeeAll = canSeeAllRecords(session, 'leads')
  const assignedIdConstraint = canSeeAll
    ? (assignedToFilter ? { assignedToId: assignedToFilter } : {})
    : { assignedToId: session.id }  // non-management staff see only their own queue

  const opportunities = await prisma.recoveryOpportunity.findMany({
    where: {
      ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...assignedIdConstraint,
      detectedAt: { gte: since },
    },
    orderBy: [
      // URGENT → HIGH → MEDIUM → LOW, then most recent
      { priority: 'asc' },   // lexicographic won't sort correctly — client sorts by PRIORITY_ORDER
      { detectedAt: 'desc' },
    ],
    take: 200,
    select: {
      id:               true,
      type:             true,
      status:           true,
      priority:         true,
      reason:           true,
      amount:           true,
      currency:         true,
      assignedToId:     true,
      userId:           true,
      leadId:           true,
      tripId:           true,
      cartSessionId:    true,
      quoteId:          true,
      bookingId:        true,
      activityBookingId: true,
      detectedAt:       true,
      lastActivityAt:   true,
      nextActionAt:     true,
      recoveredAt:      true,
      recoveredAmount:  true,
      recoveredCurrency: true,
      notes:            true,
    },
  })

  // Enrich with lead/user names for display — batch query
  const leadIds   = [...new Set(opportunities.map(o => o.leadId).filter(Boolean) as string[])]
  const staffIds  = [...new Set(opportunities.map(o => o.assignedToId).filter(Boolean) as string[])]

  const [leads, staffMembers] = await Promise.all([
    leadIds.length  > 0 ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, email: true } }) : [],
    staffIds.length > 0 ? prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [],
  ])

  const leadMap  = new Map(leads.map(l => [l.id, l]))
  const staffMap = new Map(staffMembers.map(s => [s.id, s]))

  type OppRow = typeof opportunities[number]

  // Summary: open value by currency (never summed across currencies)
  const openValue: Record<string, number> = {}
  for (const opp of opportunities) {
    if (['OPEN', 'CONTACTED', 'IN_PROGRESS'].includes(opp.status) && opp.amount && opp.currency) {
      const cur = opp.currency.toUpperCase()
      openValue[cur] = (openValue[cur] ?? 0) + opp.amount
    }
  }

  // Priority counts
  const priorityCounts = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const opp of opportunities) {
    if (['OPEN', 'CONTACTED', 'IN_PROGRESS'].includes(opp.status)) {
      const p = opp.priority as keyof typeof priorityCounts
      if (p in priorityCounts) priorityCounts[p]++
    }
  }

  const enriched = opportunities.map((opp: OppRow) => ({
    ...opp,
    leadName:      opp.leadId      ? leadMap.get(opp.leadId)?.name      ?? null : null,
    leadEmail:     opp.leadId      ? leadMap.get(opp.leadId)?.email     ?? null : null,
    assignedName:  opp.assignedToId ? staffMap.get(opp.assignedToId)?.name ?? null : null,
  }))

  return NextResponse.json({
    opportunities: enriched,
    summary: {
      total:          opportunities.length,
      priorityCounts,
      openValue,       // by currency — never summed
    },
  })
}
