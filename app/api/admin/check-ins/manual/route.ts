// POST /api/admin/check-ins/manual
//
// The ONLY way a staff member can satisfy a scheduled check-in. Admin-panel
// login, page activity, API activity, Inbox activity, Team Hub activity, and
// browser heartbeats are NEVER read here or anywhere else in the check-in
// system to infer attendance — this explicit button press is attendance.
//
// The browser can submit nothing — no staffId, no timestamp, no window
// choice. Every authoritative value (who, when, which window, what
// timezone) is resolved server-side from the authenticated session and the
// server clock.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { buildTodaysWindows, isWindowOpenForCheckIn } from '@/lib/check-ins/windows'

export async function POST() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!session.staffId) return NextResponse.json({ error: 'No staff record linked to this account' }, { status: 400 })

    const staff = await prisma.staff.findUnique({
      where:  { id: session.staffId },
      select: {
        id: true, isActive: true, checkInTracked: true,
        timezone: true, breakStartHour: true, breakEndHour: true,
      },
    })
    if (!staff || !staff.isActive || !staff.checkInTracked) {
      return NextResponse.json({ error: 'Check-in is not enabled for this account' }, { status: 400 })
    }

    const settings = await prisma.checkInSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings?.enabled) {
      return NextResponse.json({ error: 'Check-in tracking is currently disabled' }, { status: 400 })
    }

    const now   = new Date()
    const tz    = staff.timezone ?? 'Africa/Lagos'
    const grace = settings.graceMinutes ?? 0

    const windows = buildTodaysWindows({
      now,
      timezone:       tz,
      breakStartHour: staff.breakStartHour ?? 13,
      breakEndHour:   staff.breakEndHour   ?? 14,
      settings: {
        workStartHour: settings.workStartHour, workEndHour: settings.workEndHour,
        satEnabled:    settings.satEnabled,    satStartHour: settings.satStartHour, satEndHour: settings.satEndHour,
        sunEnabled:    settings.sunEnabled,
      },
    })

    if (windows.length === 0) {
      return NextResponse.json({ error: 'No check-in window is currently open' }, { status: 400 })
    }

    // Existing records for today's windows, so we can find the EARLIEST
    // window that (a) is still open (in-progress, or within grace after
    // closing) and (b) has no manual check-in recorded yet. This is what
    // lets a slightly-late check-in (within the configured grace period)
    // rescue the window that just closed, without ever retroactively
    // reopening a window the cron has already confirmed MISSED, and
    // without ever letting one click satisfy more than one window.
    const existing = await prisma.checkInRecord.findMany({
      where:   { staffId: staff.id, windowStart: { in: windows.map(w => w.windowStart) } },
      select:  { windowStart: true, manualCheckin: true, status: true },
    })
    const existingBySlot = new Map(existing.map(r => [r.windowStart.getTime(), r]))

    const target = windows.find(w => {
      const rec = existingBySlot.get(w.windowStart.getTime())
      if (rec?.manualCheckin) return false // already checked in — not a candidate
      if (rec?.status === 'MISSED') return false // cron already confirmed this one missed — sealed
      return isWindowOpenForCheckIn(w, now, grace)
    })

    if (!target) {
      // Every window today is either already checked in, already sealed as
      // MISSED, or not yet open — most commonly this means "you already
      // checked in for the current window" (duplicate click). Return the
      // current window's record, if any, so the client can show the
      // existing CHECKED IN state instead of an error.
      const currentWindow = windows[windows.length - 1]
      const currentRec = currentWindow ? existingBySlot.get(currentWindow.windowStart.getTime()) : null
      if (currentRec?.manualCheckin) {
        const record = await prisma.checkInRecord.findUnique({
          where: { staffId_windowStart: { staffId: staff.id, windowStart: currentWindow.windowStart } },
        })
        return NextResponse.json({ record, alreadyCheckedIn: true })
      }
      return NextResponse.json({ error: 'No check-in window is currently open' }, { status: 400 })
    }

    // Upsert is the duplicate-click / multiple-tab safety net — the unique
    // constraint on (staffId, windowStart) guarantees exactly one record.
    const record = await prisma.checkInRecord.upsert({
      where:  { staffId_windowStart: { staffId: staff.id, windowStart: target.windowStart } },
      create: {
        staffId:           staff.id,
        windowStart:       target.windowStart,
        present:           true,
        manualCheckin:     true,
        flagged:           false,
        status:            'CHECKED_IN',
        actualCheckInAt:   now,
        source:            'MANUAL',
        timezoneAtCheckIn: tz,
      },
      update: {
        present:           true,
        manualCheckin:     true,
        flagged:           false,
        status:            'CHECKED_IN',
        actualCheckInAt:   now,
        source:            'MANUAL',
        timezoneAtCheckIn: tz,
      },
    })

    return NextResponse.json({ record })
  } catch (err) {
    console.error('[check-in manual POST]', err)
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 })
  }
}
