// GET /api/admin/check-ins/my — the authenticated staff member's own
// check-in view (StaffCheckInWidget). Attendance is decided purely from
// CheckInRecord.status, which itself is only ever set by an explicit manual
// check-in (this route) or the missed-check-in cron — never by admin-panel,
// Inbox, Team Hub, or any other activity signal.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { buildTodaysWindows, tzOffsetHours, isWindowOpenForCheckIn, type ScheduleSettings } from '@/lib/check-ins/windows'

// Roles that are never subject to check-in tracking regardless of toggle
const EXEMPT_ROLES = new Set(['super_admin', 'general_manager', 'senior_manager', 'Admin', 'admin'])

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!session.staffId || EXEMPT_ROLES.has(session.role) || EXEMPT_ROLES.has(session.staffRole)) {
      return NextResponse.json({ tracked: false })
    }

    const staffId = session.staffId
    const [staffRow, settings] = await Promise.all([
      prisma.staff.findUnique({
        where:  { id: staffId },
        select: { checkInTracked: true, name: true, timezone: true, breakStartHour: true, breakEndHour: true },
      }),
      prisma.checkInSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null),
    ])

    if (!staffRow?.checkInTracked || !settings?.enabled) {
      return NextResponse.json({ tracked: false })
    }

    const tz    = staffRow.timezone ?? 'Africa/Lagos'
    const grace = settings.graceMinutes ?? 0
    const now   = new Date()

    const scheduleSettings: ScheduleSettings = {
      workStartHour: settings.workStartHour, workEndHour: settings.workEndHour,
      satEnabled:    settings.satEnabled,    satStartHour: settings.satStartHour, satEndHour: settings.satEndHour,
      sunEnabled:    settings.sunEnabled,
    }

    const todaysWindows = buildTodaysWindows({
      now, timezone: tz,
      breakStartHour: staffRow.breakStartHour ?? 13, breakEndHour: staffRow.breakEndHour ?? 14,
      settings: scheduleSettings,
    })

    // Week boundary (Sunday) in this staff member's own local timezone.
    const offset = tzOffsetHours(tz)
    const nowLocal   = new Date(now.getTime() + offset * 3_600_000)
    const todayLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()))
    const weekStartLocal = new Date(todayLocal)
    weekStartLocal.setUTCDate(todayLocal.getUTCDate() - todayLocal.getUTCDay())
    const weekStartUtc = new Date(weekStartLocal.getTime() - offset * 3_600_000)

    const [todayRecords, weekRecords, weekDeductions] = await Promise.all([
      prisma.checkInRecord.findMany({
        where:   { staffId, windowStart: { in: todaysWindows.map(w => w.windowStart) } },
        orderBy: { windowStart: 'asc' },
      }),
      prisma.checkInRecord.findMany({
        where:  { staffId, windowStart: { gte: weekStartUtc, lte: now } },
        select: { status: true, waived: true },
      }),
      (prisma as any).checkInDeduction.findMany({
        where:  { staffId, status: 'ACTIVE', createdAt: { gte: weekStartUtc } },
        select: { amount: true, currency: true },
      }).catch(() => [] as { amount: number; currency: string }[]),
    ])

    const recordBySlot = new Map(todayRecords.map(r => [r.windowStart.getTime(), r]))

    const todaySlotsOut = todaysWindows.map(w => {
      const rec = recordBySlot.get(w.windowStart.getTime())
      return {
        id:              rec?.id ?? null,
        windowStart:     w.windowStart.toISOString(),
        lagosHour:       w.localHour, // field name kept for client back-compat; value is the staff's OWN local hour
        status:          rec?.status ?? 'PENDING',
        manualCheckin:   rec?.manualCheckin ?? false,
        actualCheckInAt: rec?.actualCheckInAt ? rec.actualCheckInAt.toISOString() : null,
        dispute:         rec?.dispute ?? null,
        disputeStatus:   rec?.disputeStatus ?? null,
        waived:          rec?.waived ?? false,
      }
    })

    const weekMissed     = weekRecords.filter(r => r.status === 'MISSED' && !r.waived).length
    const weekCompleted  = weekRecords.filter(r => r.status === 'CHECKED_IN').length
    const weekRequired   = weekRecords.length
    const deductionsByCurrency: Record<string, number> = {}
    for (const d of weekDeductions as { amount: number; currency: string }[]) {
      deductionsByCurrency[d.currency] = (deductionsByCurrency[d.currency] ?? 0) + d.amount
    }

    // Current window — is it open right now, and if so, for how much longer?
    const currentWindow = todaysWindows[todaysWindows.length - 1] ?? null
    let currentSlot = null
    if (currentWindow) {
      const rec = recordBySlot.get(currentWindow.windowStart.getTime())
      const isOpen = isWindowOpenForCheckIn(currentWindow, now, grace)
      const minutesRemaining = Math.max(0, Math.round((currentWindow.windowEnd.getTime() + grace * 60_000 - now.getTime()) / 60_000))
      currentSlot = {
        id:              rec?.id ?? null,
        windowStart:     currentWindow.windowStart.toISOString(),
        windowEnd:       currentWindow.windowEnd.toISOString(),
        lagosHour:       currentWindow.localHour,
        status:          rec?.status ?? 'PENDING',
        manualCheckin:   rec?.manualCheckin ?? false,
        actualCheckInAt: rec?.actualCheckInAt ? rec.actualCheckInAt.toISOString() : null,
        open:            isOpen && !(rec?.manualCheckin),
        minutesRemaining,
      }
    }

    const currencySymbol = tz === 'Africa/Accra' ? 'GH₵' : '₦'

    return NextResponse.json({
      tracked: true,
      name:  staffRow.name,
      workStart: settings.workStartHour, workEnd: settings.workEndHour,
      currentSlot,
      todaySlots:  todaySlotsOut,
      weekSummary: { required: weekRequired, completed: weekCompleted, missed: weekMissed, deductionsByCurrency },
      currencySymbol,
    })
  } catch (err) {
    console.error('[check-ins/my GET]', err)
    return NextResponse.json({ tracked: false, error: 'not_configured' })
  }
}
