// app/api/cron/check-ins/route.ts
// Hourly cron — triggered by GitHub Actions (.github/workflows/check-ins-hourly.yml).
// For each tracked staff member, for each completed work-hour window:
//   1. Creates / updates CheckInRecord (present | missed)
//   2. On a NEW miss: sends immediate miss notification to staff + management alert
//
// Break windows are excluded from slot generation.
// Per-staff deduction override (GHS for Priscilla) takes precedence over global setting.

import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { getResend }    from '@/lib/resend'
import {
  missEmail,
  managementMissEmail,
  FROM_EMAIL,
} from '@/lib/check-ins/emails'
import { randomUUID } from 'crypto'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET          = process.env.CRON_SECRET
const PORTAL_URL           = 'https://www.walztravels.com/admin/staff?tab=check-ins'
const MANAGEMENT_EMAIL     = 'contact@walztravels.com'  // receives every miss alert

function tzOffsetHours(tz: string): number {
  const now   = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const utc   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - utc.getTime()) / 3_600_000)
}

function fmt12(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 === 0 ? 12 : h % 12
  return `${hour}:00 ${suffix}`
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowUtc   = new Date()
  const settings = await prisma.checkInSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tracking disabled' })
  }

  const trackedStaff = await prisma.staff.findMany({
    where:  { isActive: true, checkInTracked: true },
    select: {
      id:               true,
      name:             true,
      email:            true,
      timezone:         true,
      breakStartHour:   true,
      breakEndHour:     true,
      deductionOverride: true,
    },
  })

  if (trackedStaff.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'no tracked staff' })
  }

  // Build per-staff completed windows (only past windows, break excluded)
  type StaffWindow = { windowStart: Date; windowEnd: Date; localHour: number }
  const staffWindows = new Map<string, StaffWindow[]>()

  for (const staff of trackedStaff) {
    const offset      = tzOffsetHours(staff.timezone ?? 'Africa/Lagos')
    const nowLocal    = new Date(nowUtc.getTime() + offset * 3_600_000)
    const todayLocal  = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()))
    const breakStart  = staff.breakStartHour ?? 13
    const breakEnd    = staff.breakEndHour   ?? 14

    // Determine hours for today based on local day-of-week (0=Sun,6=Sat)
    const localDow = nowLocal.getUTCDay()
    let workStart: number
    let workEnd:   number
    if (localDow === 0) {
      // Sunday — off unless explicitly enabled
      if (!settings.sunEnabled) { staffWindows.set(staff.id, []); continue }
      workStart = settings.workStartHour ?? 8
      workEnd   = settings.workEndHour   ?? 17
    } else if (localDow === 6) {
      // Saturday
      if (!settings.satEnabled) { staffWindows.set(staff.id, []); continue }
      workStart = settings.satStartHour ?? 9
      workEnd   = settings.satEndHour   ?? 14
    } else {
      // Mon–Fri
      workStart = settings.workStartHour ?? 8
      workEnd   = settings.workEndHour   ?? 17
    }

    const windows: StaffWindow[] = []

    for (let h = workStart; h < workEnd; h++) {
      if (h >= breakStart && h < breakEnd) continue // skip break hour(s)

      const localSlotMs  = todayLocal.getTime() + h * 3_600_000
      const windowStart  = new Date(localSlotMs - offset * 3_600_000)  // to UTC
      if (windowStart >= nowUtc) continue                                // not yet completed

      windows.push({
        windowStart,
        windowEnd:  new Date(windowStart.getTime() + 3_600_000),
        localHour:  h,
      })
    }
    staffWindows.set(staff.id, windows)
  }

  const allWindowStarts = Array.from(staffWindows.values()).flat().map(w => w.windowStart)
  if (allWindowStarts.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no completed windows' })
  }

  // Bulk-fetch all activity and call logs in one shot
  const dayStart    = new Date(Math.min(...allWindowStarts.map(d => d.getTime())))
  const allWindowEnds = Array.from(staffWindows.values()).flat().map(w => w.windowEnd)
  const dayEnd      = new Date(Math.max(...allWindowEnds.map(d => d.getTime())))
  const staffEmails = trackedStaff.map(s => s.email).filter(Boolean)

  const [allLogs, allCallLogs] = await Promise.all([
    prisma.activityLog.findMany({
      where:  { staffId: { in: trackedStaff.map(s => s.id) }, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { staffId: true, createdAt: true },
    }),
    prisma.callLog.findMany({
      where:  { assignedTo: { in: staffEmails }, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { assignedTo: true, createdAt: true },
    }).catch(() => [] as { assignedTo: string; createdAt: Date }[]),
  ])

  const resend = getResend()
  let totalCreated = 0
  let totalUpdated = 0
  let emailsSent   = 0
  const emailErrors: string[] = []

  for (const staff of trackedStaff) {
    const staffLogs     = allLogs.filter(l => l.staffId === staff.id)
    const staffCallLogs = allCallLogs.filter(l => l.assignedTo === staff.email)
    const myWindows     = staffWindows.get(staff.id) ?? []
    const breakStart    = staff.breakStartHour ?? 13
    const breakEnd      = staff.breakEndHour   ?? 14

    // Effective deduction: per-staff override wins over global setting
    const deductionAmt  = staff.deductionOverride ?? settings.deductionPerMiss ?? 0
    const currencySymbol = (staff.timezone ?? '') === 'Africa/Accra' ? 'GH₵' : '₦'
    const tzLabel        = (staff.timezone ?? '') === 'Africa/Accra' ? 'Ghana time' : 'Lagos time'

    for (const { windowStart, windowEnd, localHour } of myWindows) {
      const hasActivity = staffLogs.some(l => l.createdAt >= windowStart && l.createdAt < windowEnd)
      const hasCall     = staffCallLogs.some(l => l.createdAt >= windowStart && l.createdAt < windowEnd)
      const present     = hasActivity || hasCall

      const existing = await prisma.checkInRecord.findUnique({
        where: { staffId_windowStart: { staffId: staff.id, windowStart } },
      })

      if (existing) {
        // Update presence if the record wasn't a manual check-in
        if (!existing.manualCheckin) {
          await prisma.checkInRecord.update({
            where: { id: existing.id },
            data:  {
              present,
              autoDetected: present,
              flagged: !present && !existing.waived,
            },
          })
          totalUpdated++
        }
        // Do NOT re-email — miss email was sent when the record was first created
        continue
      }

      // New record
      await prisma.checkInRecord.create({
        data: {
          staffId:     staff.id,
          windowStart,
          present,
          autoDetected: present,
          flagged:      !present,
          deductionAmt: !present ? deductionAmt : 0,
        },
      })
      totalCreated++

      // Only send miss emails for new records to avoid re-alerting on updates
      if (!present && staff.email) {
        const slotLabel   = fmt12(localHour)
        const isPostBreak = localHour === breakEnd

        // Deduplicate: already sent a miss email for this slot?
        const alreadyNotified = await prisma.notificationLog.findUnique({
          where: { staffId_type_slotUtc: { staffId: staff.id, type: 'miss', slotUtc: windowStart } },
        }).catch(() => null)

        if (!alreadyNotified) {
          // Count today's misses for management context
          const todayStart = new Date(windowStart)
          todayStart.setUTCHours(0, 0, 0, 0)
          const missedToday = await prisma.checkInRecord.count({
            where: { staffId: staff.id, flagged: true, waived: false, windowStart: { gte: todayStart } },
          }).catch(() => 1)

          // Week deductions for management context
          const weekStart = new Date(windowStart)
          const dayOfWeek = weekStart.getUTCDay()
          weekStart.setUTCDate(weekStart.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
          weekStart.setUTCHours(0, 0, 0, 0)
          const weekRecs = await prisma.checkInRecord.findMany({
            where:  { staffId: staff.id, windowStart: { gte: weekStart } },
            select: { deductionAmt: true },
          }).catch(() => [])
          const weekDeductions = weekRecs.reduce((s, r) => s + r.deductionAmt, 0)

          const staffMissPayload  = missEmail({
            name:           staff.name,
            slotLabel,
            deductionAmt,
            currency:       staff.timezone === 'Africa/Accra' ? 'GHS' : 'NGN',
            currencySymbol,
            isPostBreak,
            portalUrl:      PORTAL_URL,
          })

          const mgmtPayload = managementMissEmail({
            staffName:      staff.name,
            slotLabel:      `${slotLabel} ${tzLabel}`,
            deductionAmt,
            currencySymbol,
            missedToday,
            weekDeductions,
            isPostBreak,
            portalUrl:      PORTAL_URL,
          })

          try {
            await Promise.all([
              resend.emails.send({
                from:    FROM_EMAIL,
                to:      staff.email,
                subject: staffMissPayload.subject,
                html:    staffMissPayload.html,
              }),
              staff.email !== MANAGEMENT_EMAIL
                ? resend.emails.send({
                    from:    FROM_EMAIL,
                    to:      MANAGEMENT_EMAIL,
                    subject: mgmtPayload.subject,
                    html:    mgmtPayload.html,
                  })
                : Promise.resolve(),
            ])

            // Log notification to prevent duplicates on cron retry
            await prisma.notificationLog.createMany({
              data: [
                { id: randomUUID(), staffId: staff.id, type: 'miss',     slotUtc: windowStart },
                { id: randomUUID(), staffId: staff.id, type: 'mgmt_miss', slotUtc: windowStart },
              ],
              skipDuplicates: true,
            }).catch(() => {})

            emailsSent++
          } catch (e: unknown) {
            emailErrors.push(`${staff.name} miss email: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    }
  }

  const totalWindowsProcessed = Array.from(staffWindows.values()).reduce((n, w) => n + w.length, 0)

  return NextResponse.json({
    ok:               true,
    windowsProcessed: totalWindowsProcessed,
    tracked:          trackedStaff.length,
    totalCreated,
    totalUpdated,
    emailsSent,
    emailErrors: emailErrors.length ? emailErrors : undefined,
  })
}
