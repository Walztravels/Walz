import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const TZ_OFFSET_HOURS = 1 // Africa/Lagos = UTC+1

function lagosNow(): Date {
  const utc = new Date()
  return new Date(utc.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000)
}

function lagosToUtc(d: Date): Date {
  return new Date(d.getTime() - TZ_OFFSET_HOURS * 60 * 60 * 1000)
}

// Roles that are never subject to check-in tracking regardless of toggle
const EXEMPT_ROLES = new Set(['super_admin', 'general_manager', 'senior_manager', 'Admin', 'admin'])

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Super admin, general/senior manager, and env-var admin are never tracked
    if (!session.staffId || EXEMPT_ROLES.has(session.role) || EXEMPT_ROLES.has(session.staffRole)) {
      return NextResponse.json({ tracked: false })
    }

    const staffId = session.staffId

    // Load staff's tracking flag and settings in parallel
    const [staffRow, settings] = await Promise.all([
      prisma.staff.findUnique({
        where:  { id: staffId },
        select: { checkInTracked: true, name: true },
      }),
      prisma.checkInSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null),
    ])

    if (!staffRow?.checkInTracked) {
      return NextResponse.json({ tracked: false })
    }

    const workStart = settings?.workStartHour ?? 8
    const workEnd   = settings?.workEndHour   ?? 18

    // Current Lagos time
    const nowLagos   = lagosNow()
    const hourLagos  = nowLagos.getUTCHours()
    const todayLagos = new Date(Date.UTC(nowLagos.getUTCFullYear(), nowLagos.getUTCMonth(), nowLagos.getUTCDate()))

    // Day boundaries in UTC
    const dayStartUtc = lagosToUtc(todayLagos)
    const dayEndUtc   = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000)

    // Build all work-hour slot windowStarts for today (in UTC)
    const allSlots: Date[] = []
    for (let h = workStart; h < workEnd; h++) {
      const lagosSlot = new Date(Date.UTC(todayLagos.getUTCFullYear(), todayLagos.getUTCMonth(), todayLagos.getUTCDate(), h, 0, 0, 0))
      allSlots.push(lagosToUtc(lagosSlot))
    }

    // Fetch today's records and week summary in parallel
    const weekStartLagos = new Date(todayLagos)
    weekStartLagos.setUTCDate(todayLagos.getUTCDate() - todayLagos.getUTCDay()) // Sunday
    const weekStartUtc = lagosToUtc(weekStartLagos)

    const [todayRecords, weekRecords, todayCallLogs] = await Promise.all([
      prisma.checkInRecord.findMany({
        where:   { staffId, windowStart: { gte: dayStartUtc, lt: dayEndUtc } },
        orderBy: { windowStart: 'asc' },
      }),
      prisma.checkInRecord.findMany({
        where:   { staffId, windowStart: { gte: weekStartUtc } },
        select:  { flagged: true, waived: true, deductionAmt: true },
      }),
      // Call presence — CallLog uses email, not staffId
      prisma.callLog.findMany({
        where:  { assignedTo: session.email, createdAt: { gte: dayStartUtc, lt: dayEndUtc } },
        select: { createdAt: true },
      }).catch(() => [] as { createdAt: Date }[]),
    ])

    // Map today's records by windowStart ms
    const recordBySlot = new Map(todayRecords.map(r => [r.windowStart.getTime(), r]))

    // Build todaySlots (only past/current slots up to now)
    const pastSlots = allSlots.filter(s => s.getTime() <= lagosToUtc(nowLagos).getTime())
    const todaySlotsOut = pastSlots.map(slotUtc => {
      const rec          = recordBySlot.get(slotUtc.getTime())
      const slotEnd      = new Date(slotUtc.getTime() + 60 * 60 * 1000)
      const lagosSlot    = new Date(slotUtc.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000)
      const hasCall      = todayCallLogs.some(l => l.createdAt >= slotUtc && l.createdAt < slotEnd)
      const activitySource: 'call' | 'admin' | 'manual' | null =
        rec?.manualCheckin ? 'manual' :
        hasCall            ? 'call'   :
        rec?.autoDetected  ? 'admin'  :
        null
      return {
        id:             rec?.id ?? null,
        windowStart:    slotUtc.toISOString(),
        lagosHour:      lagosSlot.getUTCHours(),
        present:        (rec?.present ?? false) || hasCall,
        autoDetected:   rec?.autoDetected  ?? false,
        manualCheckin:  rec?.manualCheckin ?? false,
        flagged:        rec?.flagged       ?? false,
        waived:         rec?.waived        ?? false,
        dispute:        rec?.dispute       ?? null,
        disputeStatus:  rec?.disputeStatus ?? null,
        activitySource,
      }
    })

    // Week summary
    const weekMissed     = weekRecords.filter(r => r.flagged && !r.waived).length
    const weekWaived     = weekRecords.filter(r => r.waived).length
    const weekDeductions = weekRecords.reduce((s, r) => s + r.deductionAmt, 0)

    // Current slot
    const isWorkHours = hourLagos >= workStart && hourLagos < workEnd
    let currentSlot = null

    if (isWorkHours) {
      const currentLagosSlotDate = new Date(Date.UTC(
        todayLagos.getUTCFullYear(), todayLagos.getUTCMonth(), todayLagos.getUTCDate(),
        hourLagos, 0, 0, 0,
      ))
      const currentSlotUtc = lagosToUtc(currentLagosSlotDate)
      const windowEndUtc   = new Date(currentSlotUtc.getTime() + 60 * 60 * 1000)

      const rec = recordBySlot.get(currentSlotUtc.getTime())

      // Check for activity AND call presence in current window
      const [activityCount, callCount] = await Promise.all([
        prisma.activityLog.count({
          where: { staffId, createdAt: { gte: currentSlotUtc, lt: windowEndUtc } },
        }).catch(() => 0),
        prisma.callLog.count({
          where: { assignedTo: session.email, createdAt: { gte: currentSlotUtc, lt: windowEndUtc } },
        }).catch(() => 0),
      ])

      const hasActivityThisSlot = activityCount > 0 || callCount > 0
      const minutesElapsed      = nowLagos.getUTCMinutes()
      const minutesRemaining    = 60 - minutesElapsed

      currentSlot = {
        id:                    rec?.id ?? null,
        windowStart:           currentSlotUtc.toISOString(),
        windowEnd:             windowEndUtc.toISOString(),
        lagosHour:             hourLagos,
        present:               (rec?.present ?? false) || callCount > 0,
        manualCheckin:         rec?.manualCheckin ?? false,
        autoDetected:          rec?.autoDetected  ?? false,
        flagged:               rec?.flagged       ?? false,
        waived:                rec?.waived        ?? false,
        minutesRemaining,
        hasActivityThisSlot,
      }
    }

    return NextResponse.json({
      tracked: true,
      name:        staffRow.name,
      workStart,
      workEnd,
      currentSlot,
      todaySlots:  todaySlotsOut,
      weekSummary: { missed: weekMissed, waived: weekWaived, totalDeductions: weekDeductions },
    })
  } catch (err) {
    console.error('[check-ins/my GET]', err)
    return NextResponse.json({ tracked: false, error: 'not_configured' })
  }
}
