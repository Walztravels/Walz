import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const TZ_OFFSET_HOURS = 1 // Africa/Lagos = UTC+1
const ADMIN_ROLES = new Set(['super_admin', 'operations_manager', 'general_manager', 'senior_manager'])

function lagosNow() {
  const utc = new Date()
  return new Date(utc.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000)
}
function lagosToUtc(d: Date) {
  return new Date(d.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000)
}

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const nowLagos    = lagosNow()
    const todayLagos  = new Date(Date.UTC(nowLagos.getUTCFullYear(), nowLagos.getUTCMonth(), nowLagos.getUTCDate()))
    const dayStartUtc = lagosToUtc(todayLagos)
    const dayEndUtc   = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000)
    const hourLagos   = nowLagos.getUTCHours()

    // Current slot window in UTC
    const currentSlotLagos = new Date(Date.UTC(todayLagos.getUTCFullYear(), todayLagos.getUTCMonth(), todayLagos.getUTCDate(), hourLagos, 0, 0, 0))
    const currentSlotUtc   = lagosToUtc(currentSlotLagos)
    const currentSlotEnd   = new Date(currentSlotUtc.getTime() + 60 * 60 * 1000)

    // Week start (Sunday) in UTC
    const weekStartLagos = new Date(todayLagos)
    weekStartLagos.setUTCDate(todayLagos.getUTCDate() - todayLagos.getUTCDay())
    const weekStartUtc = lagosToUtc(weekStartLagos)

    // All tracked + active staff
    const staffList = await prisma.staff.findMany({
      where:  { checkInTracked: true, isActive: true },
      select: { id: true, name: true, email: true, role: true, roleTitle: true },
    })

    if (staffList.length === 0) {
      return NextResponse.json({
        staffStatus: [],
        stats: { activeNow: 0, trackedTotal: 0, missedToday: 0, pendingReview: 0, weekDeductions: 0 },
        flagged: [],
      })
    }

    const staffIds    = staffList.map(s => s.id)
    const staffEmails = staffList.map(s => s.email).filter(Boolean)

    // Parallel queries
    const [
      todayActivityLogs,
      currentSlotLogs,
      activeCallLogs,
      todayRecords,
      weekRecords,
      flaggedRecords,
    ] = await Promise.all([
      // Last activity per staff today (for "last check-in" time)
      prisma.activityLog.findMany({
        where:   { staffId: { in: staffIds }, createdAt: { gte: dayStartUtc, lt: dayEndUtc } },
        select:  { staffId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      // Current slot activity (to determine "active" status)
      prisma.activityLog.findMany({
        where:  { staffId: { in: staffIds }, createdAt: { gte: currentSlotUtc, lt: currentSlotEnd } },
        select: { staffId: true },
      }),
      // Active calls right now
      prisma.callLog.findMany({
        where:  {
          assignedTo: { in: staffEmails },
          status:     { in: ['active', 'ringing', 'initiated'] },
          updatedAt:  { gte: new Date(Date.now() - 5 * 60 * 1000) }, // last 5 min
        },
        select: { assignedTo: true },
      }),
      // Today's check-in records
      prisma.checkInRecord.findMany({
        where:  { staffId: { in: staffIds }, windowStart: { gte: dayStartUtc, lt: dayEndUtc } },
        select: { staffId: true, flagged: true, waived: true, disputeStatus: true },
      }),
      // This week's records for deduction totals
      prisma.checkInRecord.findMany({
        where:  { staffId: { in: staffIds }, windowStart: { gte: weekStartUtc } },
        select: { staffId: true, deductionAmt: true, flagged: true, waived: true },
      }),
      // Flagged & unresolved records (for the "Flagged for review" section)
      prisma.checkInRecord.findMany({
        where:  {
          staffId:  { in: staffIds },
          flagged:  true,
          waived:   false,
        },
        include: { staff: { select: { id: true, name: true, roleTitle: true } } },
        orderBy: { windowStart: 'desc' },
        take:    20,
      }),
    ])

    // Build lookup maps
    const lastActivityMap   = new Map<string, Date>()
    for (const log of todayActivityLogs) {
      if (log.staffId && !lastActivityMap.has(log.staffId)) {
        lastActivityMap.set(log.staffId, log.createdAt)
      }
    }

    const activeNowSet   = new Set(currentSlotLogs.map(l => l.staffId).filter(Boolean))
    const emailToId      = new Map(staffList.map(s => [s.email, s.id]))
    const onCallStaffIds = new Set(
      activeCallLogs.map(c => c.assignedTo ? emailToId.get(c.assignedTo) : null).filter(Boolean) as string[]
    )

    const missedTodayByStaff  = new Map<string, number>()
    const pendingByStaff      = new Map<string, number>()
    for (const rec of todayRecords) {
      if (rec.flagged && !rec.waived) {
        missedTodayByStaff.set(rec.staffId, (missedTodayByStaff.get(rec.staffId) ?? 0) + 1)
      }
      if (rec.disputeStatus === 'pending') {
        pendingByStaff.set(rec.staffId, (pendingByStaff.get(rec.staffId) ?? 0) + 1)
      }
    }

    const weekDeductionsByStaff = new Map<string, number>()
    for (const rec of weekRecords) {
      weekDeductionsByStaff.set(rec.staffId, (weekDeductionsByStaff.get(rec.staffId) ?? 0) + rec.deductionAmt)
    }

    // Build per-staff status
    type Status = 'active_call' | 'active_admin' | 'missed' | 'pending'
    const staffStatus = staffList.map(s => {
      const missed    = missedTodayByStaff.get(s.id) ?? 0
      const isOnCall  = onCallStaffIds.has(s.id)
      const isActive  = activeNowSet.has(s.id)
      const lastAt    = lastActivityMap.get(s.id) ?? null

      let status: Status | null = null
      if (isOnCall)     status = 'active_call'
      else if (isActive) status = 'active_admin'
      else if (missed > 0) status = 'missed'
      else if ((pendingByStaff.get(s.id) ?? 0) > 0) status = 'pending'

      return {
        id:             s.id,
        name:           s.name,
        role:           s.role,
        roleTitle:      s.roleTitle,
        status,
        lastActivityAt: lastAt ? lastAt.toISOString() : null,
        missedToday:    missed,
        weekDeductions: weekDeductionsByStaff.get(s.id) ?? 0,
      }
    })

    const activeNowCount  = staffStatus.filter(s => s.status === 'active_call' || s.status === 'active_admin').length
    const missedToday     = staffStatus.reduce((t, s) => t + s.missedToday, 0)
    const totalPending    = flaggedRecords.filter(r => r.disputeStatus === 'pending').length
    const weekDeductionsTotal = weekRecords.reduce((t, r) => t + r.deductionAmt, 0)

    return NextResponse.json({
      staffStatus,
      stats: {
        activeNow:      activeNowCount,
        trackedTotal:   staffList.length,
        missedToday,
        pendingReview:  totalPending,
        weekDeductions: weekDeductionsTotal,
      },
      flagged: flaggedRecords,
    })
  } catch (err) {
    console.error('[check-ins/live GET]', err)
    return NextResponse.json({
      staffStatus: [],
      stats: { activeNow: 0, trackedTotal: 0, missedToday: 0, pendingReview: 0, weekDeductions: 0 },
      flagged: [],
      error: 'not_configured',
    })
  }
}
