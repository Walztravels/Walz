// app/api/cron/check-ins/reminder/route.ts
// Runs at :50 of every UTC hour (vercel.json: "50 * * * *").
// Sends 10-minute pre-slot reminders to tracked staff — three variants:
//   • regular   — standard upcoming-slot nudge
//   • pre_break — last slot before their break window
//   • post_break — break ends in 10 minutes
// Uses NotificationLog to deduplicate (Vercel may retry failed crons).

import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { getResend }    from '@/lib/resend'
import {
  reminderEmail,
  preBreakReminderEmail,
  postBreakReminderEmail,
  FROM_EMAIL,
} from '@/lib/check-ins/emails'
import { randomUUID } from 'crypto'

const CRON_SECRET  = process.env.CRON_SECRET
const PORTAL_URL   = 'https://www.walztravels.com/admin'

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

  const settings = await prisma.checkInSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tracking disabled' })
  }

  const trackedStaff = await prisma.staff.findMany({
    where:  { isActive: true, checkInTracked: true, email: { not: '' } },
    select: {
      id:               true,
      name:             true,
      email:            true,
      timezone:         true,
      breakStartHour:   true,
      breakEndHour:     true,
    },
  })

  if (trackedStaff.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no tracked staff' })
  }

  const resend   = getResend()
  const nowUtc   = new Date()
  const utcHour  = nowUtc.getUTCHours()         // the current UTC hour (reminder fires at :50)
  const nextUtcH = (utcHour + 1) % 24           // the slot that will open in 10 minutes

  // The windowStart UTC for the NEXT slot (rounded to the hour)
  const nextSlotUtc = new Date(Date.UTC(
    nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), nextUtcH,
  ))

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const staff of trackedStaff) {
    const tzOffset    = tzOffsetHours(staff.timezone ?? 'Africa/Lagos')
    const nextLocal   = (nextUtcH + tzOffset + 24) % 24   // next slot hour in staff's local time
    const breakStart  = staff.breakStartHour ?? 13
    const breakEnd    = staff.breakEndHour   ?? 14

    // Determine local day-of-week for the next slot (0=Sun, 6=Sat)
    const nextSlotLocal = new Date(nextSlotUtc.getTime() + tzOffset * 3_600_000)
    const localDow      = nextSlotLocal.getUTCDay()

    let workStart: number
    let workEnd:   number
    if (localDow === 0) {
      if (!settings.sunEnabled) { skipped++; continue }
      workStart = settings.workStartHour ?? 8
      workEnd   = settings.workEndHour   ?? 17
    } else if (localDow === 6) {
      if (!settings.satEnabled) { skipped++; continue }
      workStart = settings.satStartHour ?? 9
      workEnd   = settings.satEndHour   ?? 14
    } else {
      workStart = settings.workStartHour ?? 8
      workEnd   = settings.workEndHour   ?? 17
    }

    // Is next slot a valid work slot?
    const isDuringBreak  = nextLocal >= breakStart && nextLocal < breakEnd
    const isInsideHours  = nextLocal >= workStart && nextLocal < workEnd
    if (!isInsideHours || isDuringBreak) { skipped++; continue }

    // Determine reminder type
    const isPreBreak  = nextLocal === breakStart - 1  // slot just before break
    const isPostBreak = nextLocal === breakEnd         // slot just after break

    const notifType: 'pre_break' | 'post_break' | 'reminder' =
      isPreBreak  ? 'pre_break'  :
      isPostBreak ? 'post_break' :
      'reminder'

    // Deduplication — skip if already sent for this exact slot
    const alreadySent = await prisma.notificationLog.findUnique({
      where: { staffId_type_slotUtc: { staffId: staff.id, type: notifType, slotUtc: nextSlotUtc } },
    }).catch(() => null)

    if (alreadySent) { skipped++; continue }

    const tzLabel = staff.timezone === 'Africa/Accra' ? 'Ghana time' : 'Lagos time'

    // Find the slot AFTER next (for "coming up" context in the regular reminder)
    let afterNextLocal = nextLocal + 1
    if (afterNextLocal >= breakStart && afterNextLocal < breakEnd) afterNextLocal = breakEnd
    const nextSlotLabel = fmt12(nextLocal)
    const afterLabel    = (afterNextLocal < workEnd) ? fmt12(afterNextLocal) : null

    let emailPayload: { subject: string; html: string }

    if (notifType === 'pre_break') {
      emailPayload = preBreakReminderEmail({
        name:          staff.name,
        slotLabel:     nextSlotLabel,
        breakEndLabel: fmt12(breakEnd),
        timezone:      tzLabel,
        portalUrl:     PORTAL_URL,
      })
    } else if (notifType === 'post_break') {
      emailPayload = postBreakReminderEmail({
        name:             staff.name,
        resumeSlotLabel:  nextSlotLabel,
        timezone:         tzLabel,
        portalUrl:        PORTAL_URL,
      })
    } else {
      emailPayload = reminderEmail({
        name:          staff.name,
        slotLabel:     nextSlotLabel,
        nextSlotLabel: afterLabel ?? 'no more slots today',
        timezone:      tzLabel,
        portalUrl:     PORTAL_URL,
      })
    }

    try {
      await resend.emails.send({
        from:    FROM_EMAIL,
        to:      staff.email,
        subject: emailPayload.subject,
        html:    emailPayload.html,
      })

      // Log success to prevent duplicate sends on cron retry
      await prisma.notificationLog.create({
        data: {
          id:      randomUUID(),
          staffId: staff.id,
          type:    notifType,
          slotUtc: nextSlotUtc,
        },
      }).catch(() => {}) // non-fatal — worst case: duplicate email on retry

      sent++
    } catch (e: unknown) {
      errors.push(`${staff.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok:      true,
    utcHour: `${String(utcHour).padStart(2,'0')}:50`,
    nextSlot: `${String(nextUtcH).padStart(2,'0')}:00 UTC`,
    sent,
    skipped,
    errors: errors.length ? errors : undefined,
  })
}
