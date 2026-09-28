// GET /api/admin/check-ins/live — Admin -> System -> Staff -> Check-ins dashboard feed.
//
// Check-In V2: ONLINE STATUS and CHECK-IN STATUS are computed and returned
// as two completely separate fields. A staff member can be `online: true`
// (they were recently active in the admin panel — Staff.lastActiveAt) while
// simultaneously `currentCheckIn.status === 'MISSED'`. Neither value is ever
// allowed to influence the other. Admin/session/API/Inbox/Team-Hub activity
// is read here ONLY to answer "is this person online right now" — never to
// decide attendance.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { buildTodaysWindows, tzOffsetHours, type ScheduleSettings } from '@/lib/check-ins/windows'

const ADMIN_ROLES = new Set(['super_admin', 'operations_manager', 'general_manager', 'senior_manager'])
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // consistent with the existing offline-alert threshold (chatwoot webhook)

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const settings = await prisma.checkInSettings.findUnique({ where: { id: 'singleton' } })
    const scheduleSettings: ScheduleSettings = {
      workStartHour: settings?.workStartHour ?? 8, workEndHour: settings?.workEndHour ?? 17,
      satEnabled:    settings?.satEnabled    ?? true, satStartHour: settings?.satStartHour ?? 9, satEndHour: settings?.satEndHour ?? 14,
      sunEnabled:    settings?.sunEnabled    ?? false,
    }

    const staffList = await prisma.staff.findMany({
      where:  { checkInTracked: true, isActive: true },
      select: {
        id: true, name: true, role: true, roleTitle: true,
        timezone: true, breakStartHour: true, breakEndHour: true, lastActiveAt: true,
      },
    })

    if (staffList.length === 0) {
      return NextResponse.json({
        staffStatus: [],
        stats: { checkedInThisWindow: 0, missedToday: 0, pendingReview: 0, weekDeductionsByCurrency: {} },
        flagged: [],
      })
    }

    const nowUtc = new Date()

    // Each staff member gets their OWN today/week boundaries in their OWN
    // timezone — the previous hardcoded Africa/Lagos-only offset skewed
    // Ghana (Africa/Accra, UTC+0) staff's day/week windows by an hour.
    const perStaffWindows = new Map<string, ReturnType<typeof buildTodaysWindows>>()
    const dayStartByStaff  = new Map<string, Date>()
    const weekStartByStaff = new Map<string, Date>()

    for (const s of staffList) {
      const tz = s.timezone ?? 'Africa/Lagos'
      const windows = buildTodaysWindows({
        now: nowUtc, timezone: tz,
        breakStartHour: s.breakStartHour ?? 13, breakEndHour: s.breakEndHour ?? 14,
        settings: scheduleSettings,
      })
      perStaffWindows.set(s.id, windows)

      const offset     = tzOffsetHours(tz)
      const nowLocal   = new Date(nowUtc.getTime() + offset * 3_600_000)
      const todayLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()))
      dayStartByStaff.set(s.id, new Date(todayLocal.getTime() - offset * 3_600_000))

      const weekStartLocal = new Date(todayLocal)
      weekStartLocal.setUTCDate(todayLocal.getUTCDate() - todayLocal.getUTCDay())
      weekStartByStaff.set(s.id, new Date(weekStartLocal.getTime() - offset * 3_600_000))
    }

    const staffIds = staffList.map(s => s.id)
    const earliestDayStart = new Date(Math.min(...Array.from(dayStartByStaff.values()).map(d => d.getTime())))
    const earliestWeekStart = new Date(Math.min(...Array.from(weekStartByStaff.values()).map(d => d.getTime())))

    const [todayRecords, weekRecords, weekDeductions, flaggedRecords] = await Promise.all([
      prisma.checkInRecord.findMany({
        where:  { staffId: { in: staffIds }, windowStart: { gte: earliestDayStart } },
        select: { id: true, staffId: true, windowStart: true, status: true, manualCheckin: true, actualCheckInAt: true, waived: true, disputeStatus: true },
      }),
      prisma.checkInRecord.findMany({
        where:  { staffId: { in: staffIds }, windowStart: { gte: earliestWeekStart } },
        select: { staffId: true },
      }),
      (prisma as any).checkInDeduction.findMany({
        where:  { staffId: { in: staffIds }, status: 'ACTIVE', createdAt: { gte: earliestWeekStart } },
        select: { staffId: true, amount: true, currency: true },
      }).catch(() => [] as { staffId: string; amount: number; currency: string }[]),
      prisma.checkInRecord.findMany({
        where:   { staffId: { in: staffIds }, status: 'MISSED', waived: false },
        include: { staff: { select: { id: true, name: true, roleTitle: true } } },
        orderBy: { windowStart: 'desc' },
        take:    20,
      }),
    ])

    const recordsByStaff = new Map<string, typeof todayRecords>()
    for (const s of staffList) recordsByStaff.set(s.id, [])
    for (const r of todayRecords) recordsByStaff.get(r.staffId)?.push(r)

    const missedTodayByStaff = new Map<string, number>()
    const pendingByStaff     = new Map<string, number>()
    for (const r of todayRecords) {
      if (r.status === 'MISSED' && !r.waived) missedTodayByStaff.set(r.staffId, (missedTodayByStaff.get(r.staffId) ?? 0) + 1)
      if (r.disputeStatus === 'pending') pendingByStaff.set(r.staffId, (pendingByStaff.get(r.staffId) ?? 0) + 1)
    }

    const weekDeductionsByStaff = new Map<string, Record<string, number>>()
    for (const d of weekDeductions as { staffId: string; amount: number; currency: string }[]) {
      const forStaff = weekDeductionsByStaff.get(d.staffId) ?? {}
      forStaff[d.currency] = (forStaff[d.currency] ?? 0) + d.amount
      weekDeductionsByStaff.set(d.staffId, forStaff)
    }

    // Global per-currency total for the dashboard's stat card (brief §11 —
    // NEVER numerically combine NGN + GHS into one meaningless figure).
    const weekDeductionsByCurrency: Record<string, number> = {}
    for (const d of weekDeductions as { staffId: string; amount: number; currency: string }[]) {
      weekDeductionsByCurrency[d.currency] = (weekDeductionsByCurrency[d.currency] ?? 0) + d.amount
    }

    let checkedInThisWindowCount = 0
    const staffStatus = staffList.map(s => {
      const isOnline = !!s.lastActiveAt && (nowUtc.getTime() - s.lastActiveAt.getTime()) <= ONLINE_THRESHOLD_MS

      const windows = perStaffWindows.get(s.id) ?? []
      const currentWindow = windows[windows.length - 1] ?? null
      const staffRecords  = recordsByStaff.get(s.id) ?? []
      const recordBySlot  = new Map(staffRecords.map(r => [r.windowStart.getTime(), r]))

      let currentCheckIn: { windowStart: string; localHour: number; status: string } | null = null
      if (currentWindow) {
        const rec = recordBySlot.get(currentWindow.windowStart.getTime())
        const status = rec?.status ?? 'PENDING'
        if (status === 'CHECKED_IN') checkedInThisWindowCount++
        currentCheckIn = { windowStart: currentWindow.windowStart.toISOString(), localHour: currentWindow.localHour, status }
      }

      const lastManual = staffRecords
        .filter(r => r.manualCheckin && r.actualCheckInAt)
        .sort((a, b) => (b.actualCheckInAt as Date).getTime() - (a.actualCheckInAt as Date).getTime())[0] ?? null

      return {
        id: s.id, name: s.name, role: s.role, roleTitle: s.roleTitle,
        online:         isOnline,
        lastActiveAt:   s.lastActiveAt ? s.lastActiveAt.toISOString() : null,
        currentCheckIn,
        lastManualCheckInAt: lastManual?.actualCheckInAt ? (lastManual.actualCheckInAt as Date).toISOString() : null,
        missedToday:    missedTodayByStaff.get(s.id) ?? 0,
        pendingDispute: pendingByStaff.get(s.id) ?? 0,
        weekDeductionsByCurrency: weekDeductionsByStaff.get(s.id) ?? {},
      }
    })

    const missedToday  = staffStatus.reduce((t, s) => t + s.missedToday, 0)
    const totalPending = flaggedRecords.filter(r => r.disputeStatus === 'pending').length

    return NextResponse.json({
      staffStatus,
      stats: {
        checkedInThisWindow: checkedInThisWindowCount,
        trackedTotal:        staffList.length,
        missedToday,
        pendingReview:       totalPending,
        weekDeductionsByCurrency,
      },
      flagged: flaggedRecords,
    })
  } catch (err) {
    console.error('[check-ins/live GET]', err)
    return NextResponse.json({
      staffStatus: [],
      stats: { checkedInThisWindow: 0, missedToday: 0, pendingReview: 0, weekDeductionsByCurrency: {} },
      flagged: [],
      error: 'not_configured',
    })
  }
}
