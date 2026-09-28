// app/api/cron/check-ins/route.ts
// Hourly cron — triggered by GitHub Actions (.github/workflows/check-ins-hourly.yml).
//
// Check-In V2: this job NEVER reads ActivityLog / CallLog / any admin-panel,
// Inbox, Team Hub, or browser-activity signal to decide attendance. The only
// input to a CHECKED_IN status is a CheckInRecord already created by the
// staff member explicitly pressing "Check In" (app/api/admin/check-ins/manual).
//
// For each tracked staff member, for each window that has now CLOSED (past
// its grace period) with no manual check-in on record:
//   1. Creates exactly ONE CheckInRecord with status = MISSED
//   2. Creates exactly ONE CheckInDeduction (idempotent — see
//      lib/check-ins/policy.ts) IF and ONLY IF the deduction policy is
//      financially live for that occurrence date and the country's amount
//      is configured
//   3. Sends the miss notification (email + in-app) exactly once per
//      occurrence, deduped via NotificationLog/StaffNotification sourceId
//
// Cron retries, server restarts, and overlapping invocations are all safe —
// every write here is keyed off a unique constraint with a find-before-write
// guard (CheckInRecord: staffId+windowStart: CheckInDeduction: checkInRecordId).

import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { getResend }    from '@/lib/resend'
import {
  missEmail,
  managementMissEmail,
  FROM_EMAIL,
} from '@/lib/check-ins/emails'
import { createStaffNotification } from '@/lib/notifications/staff'
import { buildTodaysWindows, isWindowClosed, fmt12, type ScheduleSettings } from '@/lib/check-ins/windows'
import { ensureMissedCheckInDeduction } from '@/lib/check-ins/policy'
import { randomUUID } from 'crypto'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET      = process.env.CRON_SECRET
const PORTAL_URL       = 'https://www.walztravels.com/admin/staff?tab=check-ins'
const MANAGEMENT_EMAIL = 'contact@walztravels.com'  // receives every miss alert

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

  const scheduleSettings: ScheduleSettings = {
    workStartHour: settings.workStartHour, workEndHour: settings.workEndHour,
    satEnabled:    settings.satEnabled,    satStartHour: settings.satStartHour, satEndHour: settings.satEndHour,
    sunEnabled:    settings.sunEnabled,
  }
  const grace = settings.graceMinutes ?? 0

  const trackedStaff = await prisma.staff.findMany({
    where:  { isActive: true, checkInTracked: true },
    select: {
      id: true, name: true, email: true, timezone: true,
      breakStartHour: true, breakEndHour: true, isActive: true,
      checkInTracked: true, hireDate: true,
    },
  })

  if (trackedStaff.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'no tracked staff' })
  }

  const resend = getResend()
  let missedCreated  = 0
  let deductionsMade = 0
  let emailsSent     = 0
  const emailErrors: string[] = []

  for (const staff of trackedStaff) {
    const tz = staff.timezone ?? 'Africa/Lagos'
    const windows = buildTodaysWindows({
      now: nowUtc, timezone: tz,
      breakStartHour: staff.breakStartHour ?? 13, breakEndHour: staff.breakEndHour ?? 14,
      settings: scheduleSettings,
    })
    const closedWindows = windows.filter(w => isWindowClosed(w, nowUtc, grace))
    if (closedWindows.length === 0) continue

    for (const { windowStart, localHour } of closedWindows) {
      const existing = await prisma.checkInRecord.findUnique({
        where: { staffId_windowStart: { staffId: staff.id, windowStart } },
      })

      // Already resolved (either CHECKED_IN by the staff member, or MISSED
      // by an earlier cron run) — nothing further to decide. We still make
      // sure a MISSED-but-somehow-deduction-less record gets its deduction
      // (server-restart-mid-run safety), but never re-notify.
      if (existing) {
        if (existing.status === 'MISSED') {
          const result = await ensureMissedCheckInDeduction(prisma, {
            staffId: staff.id, checkInRecordId: existing.id, windowStart,
            timezone: tz, settings, staff,
          })
          if (result.created) deductionsMade++
        }
        continue
      }

      // No record at all for a now-closed window => no manual check-in was
      // ever recorded during that window => MISSED. This is the entire
      // detection rule. Nothing about admin/session/API/Inbox/Team-Hub
      // activity is consulted.
      let record
      try {
        record = await prisma.checkInRecord.create({
          data: {
            staffId: staff.id, windowStart,
            present: false, flagged: true,
            status: 'MISSED', source: 'SYSTEM', timezoneAtCheckIn: tz,
          },
        })
      } catch {
        // Unique-constraint race: a manual check-in landed between our
        // findUnique and this create. Re-read and respect whatever it is.
        record = await prisma.checkInRecord.findUnique({
          where: { staffId_windowStart: { staffId: staff.id, windowStart } },
        })
        if (!record || record.status !== 'MISSED') continue
      }
      missedCreated++

      const result = await ensureMissedCheckInDeduction(prisma, {
        staffId: staff.id, checkInRecordId: record.id, windowStart,
        timezone: tz, settings, staff,
      })
      if (result.created) deductionsMade++

      // Mirror the real ledger amount onto the legacy display field so any
      // older UI/email code reading CheckInRecord.deductionAmt directly
      // still shows the correct number.
      if (result.deduction) {
        await prisma.checkInRecord.update({
          where: { id: record.id },
          data:  { deductionAmt: result.deduction.amount },
        }).catch(() => {})
      }

      // ── Notifications (exactly once per occurrence) ─────────────────────
      const alreadyNotified = await prisma.notificationLog.findUnique({
        where: { staffId_type_slotUtc: { staffId: staff.id, type: 'miss', slotUtc: windowStart } },
      }).catch(() => null)

      if (alreadyNotified) continue

      const slotLabel      = fmt12(localHour)
      const currencySymbol = tz === 'Africa/Accra' ? 'GH₵' : '₦'
      const currency       = tz === 'Africa/Accra' ? 'GHS' : 'NGN'

      // In-app notification — deduped via sourceId, staff-scoped (never
      // exposes another staff member's attendance).
      const deductionLine = result.deduction
        ? ` A ${currencySymbol}${result.deduction.amount.toLocaleString()} missed check-in deduction has been recorded.`
        : ''
      await createStaffNotification({
        staffId:    staff.id,
        category:   'SYSTEM',
        title:      `${slotLabel} check-in missed`,
        body:       `No manual check-in was recorded during the required check-in window.${deductionLine}`,
        important:  true,
        sourceId:   `checkin:miss:${staff.id}:${windowStart.toISOString()}`,
        sourceType: 'check_in',
      })

      if (staff.email) {
        const todayStart = new Date(windowStart)
        todayStart.setUTCHours(0, 0, 0, 0)
        const missedToday = await prisma.checkInRecord.count({
          where: { staffId: staff.id, status: 'MISSED', waived: false, windowStart: { gte: todayStart } },
        }).catch(() => 1)

        const weekStart = new Date(windowStart)
        const dayOfWeek = weekStart.getUTCDay()
        weekStart.setUTCDate(weekStart.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        weekStart.setUTCHours(0, 0, 0, 0)
        const weekDeductionRows = await (prisma as any).checkInDeduction.findMany({
          where:  { staffId: staff.id, status: 'ACTIVE', createdAt: { gte: weekStart } },
          select: { amount: true },
        }).catch(() => [])
        const weekDeductions = weekDeductionRows.reduce((s: number, r: { amount: number }) => s + r.amount, 0)

        const staffMissPayload = missEmail({
          name: staff.name, slotLabel, deductionAmt: result.deduction?.amount ?? 0,
          currency, currencySymbol, isPostBreak: false, portalUrl: PORTAL_URL,
        })
        const mgmtPayload = managementMissEmail({
          staffName: staff.name, slotLabel: `${slotLabel} (${tz})`,
          deductionAmt: result.deduction?.amount ?? 0, currencySymbol,
          missedToday, weekDeductions, isPostBreak: false, portalUrl: PORTAL_URL,
        })

        try {
          await Promise.all([
            resend.emails.send({ from: FROM_EMAIL, to: staff.email, subject: staffMissPayload.subject, html: staffMissPayload.html }),
            staff.email !== MANAGEMENT_EMAIL
              ? resend.emails.send({ from: FROM_EMAIL, to: MANAGEMENT_EMAIL, subject: mgmtPayload.subject, html: mgmtPayload.html })
              : Promise.resolve(),
          ])
          await prisma.notificationLog.createMany({
            data: [
              { id: randomUUID(), staffId: staff.id, type: 'miss',      slotUtc: windowStart },
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

  return NextResponse.json({
    ok: true,
    tracked: trackedStaff.length,
    missedCreated,
    deductionsMade,
    emailsSent,
    emailErrors: emailErrors.length ? emailErrors : undefined,
  })
}
