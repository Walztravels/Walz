import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/resend'

const CRON_SECRET = process.env.CRON_SECRET

function tzOffsetHours(tz: string): number {
  const now   = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const utc   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - utc.getTime()) / 3_600_000)
}

function toLocalHour(utcDate: Date, offsetHours: number) {
  return (utcDate.getUTCHours() + offsetHours) % 24
}

function fmt12h(localHour: number) {
  const h = localHour % 12 || 12
  return `${h}:00 ${localHour < 12 ? 'AM' : 'PM'}`
}

function dailySummaryEmail(params: {
  name:          string
  date:          string
  missedWindows: { localHour: number; windowStart: Date }[]
  portalUrl:     string
}) {
  const { name, date, missedWindows, portalUrl } = params

  const rows = missedWindows
    .map(({ localHour }) => `
      <tr>
        <td style="padding:8px 0;color:#e53e3e;font-size:14px;">✗</td>
        <td style="padding:8px 12px;color:#0B1F3A;font-size:14px;font-weight:600;">${fmt12h(localHour)} – ${fmt12h(localHour + 1)}</td>
        <td style="padding:8px 0;color:#718096;font-size:13px;">Not detected</td>
      </tr>`)
    .join('')

  const count = missedWindows.length

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <tr><td style="background:#0B1F3A;padding:28px 36px;">
      <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px;">Walz Travels · Attendance</p>
      <h1 style="color:#ffffff;font-size:20px;margin:0;font-weight:700;">Daily Check-in Summary</h1>
      <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:6px 0 0;">${date}</p>
    </td></tr>
    <tr><td style="padding:32px 36px;">
      <p style="color:#4a5568;font-size:15px;margin:0 0 16px;">Hi <strong style="color:#0B1F3A;">${name}</strong>,</p>
      <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 20px;">
        You missed <strong style="color:#e53e3e;">${count} check-in window${count === 1 ? '' : 's'}</strong> today.
        No activity was detected from your account during the following periods:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;border:1px solid #e8ecf0;margin-bottom:24px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px 10px 16px;text-align:left;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:1.5px;width:30px;"></th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:1.5px;">Time window</th>
            <th style="padding:10px 16px 10px 12px;text-align:left;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:1.5px;">Status</th>
          </tr>
        </thead>
        <tbody style="border-top:1px solid #e8ecf0;">
          <tr><td colspan="3" style="padding:0 16px;">${rows}</td></tr>
        </tbody>
      </table>
      <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 24px;">
        If you were actively working and believe this is an error, you can dispute any missed window directly from the staff portal.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <a href="${portalUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:10px;">
            View Check-ins &amp; Dispute
          </a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e8ecf0;">
      <p style="color:#a0aec0;font-size:11px;margin:0;text-align:center;">
        Walz Travels Admin Portal · Automated attendance report · <a href="mailto:hr@walztravels.com" style="color:#C9A84C;">hr@walztravels.com</a>
      </p>
    </td></tr>
  </table>
</body></html>`
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowUtc  = new Date()
  const settings = await prisma.checkInSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Check-in tracking disabled' })
  }

  const trackedStaff = await prisma.staff.findMany({
    where: {
      isActive:       true,
      checkInTracked: true,
    },
    select: { id: true, name: true, email: true, timezone: true },
  })

  if (trackedStaff.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No tracked staff' })
  }

  // Build per-staff windows (each staff may have a different timezone)
  type StaffWindow = { windowStart: Date; windowEnd: Date; localHour: number }
  const staffWindows = new Map<string, StaffWindow[]>()

  for (const staff of trackedStaff) {
    const offset  = tzOffsetHours(staff.timezone ?? 'Africa/Lagos')
    // "today" in staff's local timezone
    const nowLocal   = new Date(nowUtc.getTime() + offset * 60 * 60 * 1000)
    const todayLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()))
    const windows: StaffWindow[] = []

    for (let h = settings.workStartHour; h < settings.workEndHour; h++) {
      const utcHour      = (h - offset + 24) % 24
      const windowStart  = new Date(todayLocal.getTime() - offset * 60 * 60 * 1000)
      windowStart.setUTCHours(utcHour, 0, 0, 0)
      if (windowStart >= nowUtc) continue
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000)
      windows.push({ windowStart, windowEnd, localHour: h })
    }
    staffWindows.set(staff.id, windows)
  }

  // Global day range for bulk fetching logs (span all staff windows)
  const allWindowStarts = Array.from(staffWindows.values()).flat().map(w => w.windowStart)
  const allWindowEnds   = Array.from(staffWindows.values()).flat().map(w => w.windowEnd)
  if (allWindowStarts.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'No work windows to process' })
  }
  const dayStart    = new Date(Math.min(...allWindowStarts.map(d => d.getTime())))
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

  // Admin email — receives a copy of every missed-check-in notification
  const ADMIN_NOTIFY_EMAIL = 'contact@walztravels.com'

  const resend    = getResend()
  const portalUrl = 'https://www.walztravels.com/admin/staff?tab=check-ins'

  let totalCreated = 0
  let totalUpdated = 0
  let emailed      = 0
  const emailErrors: string[] = []

  const dateLabel = nowUtc.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Africa/Lagos',
  })

  for (const staff of trackedStaff) {
    const staffLogs     = allLogs.filter(l => l.staffId === staff.id)
    const staffCallLogs = allCallLogs.filter(l => l.assignedTo === staff.email)
    const missedWindows: { localHour: number; windowStart: Date }[] = []
    const myWindows     = staffWindows.get(staff.id) ?? []

    for (const { windowStart, windowEnd, localHour } of myWindows) {
      const hasActivity = staffLogs.some(l => l.createdAt >= windowStart && l.createdAt < windowEnd)
      const hasCall     = staffCallLogs.some(l => l.createdAt >= windowStart && l.createdAt < windowEnd)
      const present     = hasActivity || hasCall
      const existing = await prisma.checkInRecord.findUnique({
        where: { staffId_windowStart: { staffId: staff.id, windowStart } },
      })

      if (existing) {
        if (!existing.manualCheckin) {
          await prisma.checkInRecord.update({
            where: { id: existing.id },
            data: {
              present,
              autoDetected: present,
              flagged:      !present && !existing.waived,
            },
          })
          totalUpdated++
          // Do NOT re-add to missedWindows — email was sent when the record was first created.
          // Re-adding here would spam the same alert every hour for an already-flagged window.
        }
      } else {
        await prisma.checkInRecord.create({
          data: {
            staffId:      staff.id,
            windowStart,
            present,
            autoDetected: present,
            flagged:      !present,
            deductionAmt: !present ? (settings.deductionPerMiss ?? 0) : 0,
          },
        })
        totalCreated++
        if (!present) missedWindows.push({ localHour, windowStart })
      }
    }

    // Send daily summary email to staff + admin copy when any windows were missed
    if (missedWindows.length > 0 && staff.email) {
      try {
        const missCount = missedWindows.length
        const subject   = `Attendance Alert – ${staff.name} missed ${missCount} check-in window${missCount === 1 ? '' : 's'} today`
        const html      = dailySummaryEmail({ name: staff.name, date: dateLabel, missedWindows, portalUrl })

        await Promise.all([
          // Staff member's own copy
          resend.emails.send({
            from:    'Walz Travels Attendance <hr@walztravels.com>',
            to:      staff.email,
            subject: `Attendance Alert – ${missCount} missed window${missCount === 1 ? '' : 's'} today`,
            html,
          }),
          // Admin copy — only send if different from staff email
          staff.email !== ADMIN_NOTIFY_EMAIL
            ? resend.emails.send({
                from:    'Walz Travels Attendance <hr@walztravels.com>',
                to:      ADMIN_NOTIFY_EMAIL,
                subject,
                html,
              })
            : Promise.resolve(),
        ])
        emailed++
      } catch (e: unknown) {
        emailErrors.push(`${staff.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const totalWindowsProcessed = Array.from(staffWindows.values()).reduce((n, w) => n + w.length, 0)

  return NextResponse.json({
    ok:               true,
    date:             dateLabel,
    windowsProcessed: totalWindowsProcessed,
    tracked:          trackedStaff.length,
    totalCreated,
    totalUpdated,
    emailed,
    emailErrors,
  })
}
