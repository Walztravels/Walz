import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { createStaffNotification } from '@/lib/notifications/staff'
import { logPerformanceHistory } from '@/lib/performance/history'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Staff Performance Management — review reminders (mission brief §10).
 * Cron-secret gated, matching the convention in app/api/cron/jade-daily-brief.
 * Notifies every super_admin (never the employee) 7 days before a case's
 * nextReviewDate and again on the review date itself. Never takes any
 * management action itself — purely a reminder. NOT wired into
 * vercel.json's cron schedule by this change (see the migration/deployment
 * notes) — this route is safe to call manually or wire up separately.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const in7Days = new Date(startOfToday.getTime() + 7 * 86_400_000)
  const in8Days = new Date(startOfToday.getTime() + 8 * 86_400_000)
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000)

  const ACTIVE_STATUSES = ['OPEN', 'MONITORING', 'COACHING', 'PIP_ACTIVE', 'REVIEW_DUE', 'EXTENDED', 'ESCALATED']

  const [dueIn7, dueToday, superAdmins] = await Promise.all([
    prisma.staffPerformanceCase.findMany({
      where: { status: { in: ACTIVE_STATUSES }, nextReviewDate: { gte: in7Days, lt: in8Days } },
      select: { id: true, staffId: true, nextReviewDate: true },
    }),
    prisma.staffPerformanceCase.findMany({
      where: { status: { in: ACTIVE_STATUSES }, nextReviewDate: { gte: startOfToday, lt: endOfToday } },
      select: { id: true, staffId: true, nextReviewDate: true },
    }),
    prisma.staff.findMany({ where: { role: 'super_admin', isActive: true }, select: { id: true } }),
  ])

  if (superAdmins.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: 'No active super_admin staff to notify' })
  }

  const staffNameMap = new Map(
    (
      await prisma.staff.findMany({
        where: { id: { in: [...new Set([...dueIn7, ...dueToday].map((c) => c.staffId))] } },
        select: { id: true, name: true },
      })
    ).map((s) => [s.id, s.name]),
  )

  let sent = 0
  for (const [cases, kind, label] of [
    [dueIn7, '7_days_before', 'in 7 days'],
    [dueToday, 'on_review_date', 'today'],
  ] as const) {
    for (const c of cases) {
      const staffName = staffNameMap.get(c.staffId) ?? 'a staff member'
      for (const admin of superAdmins) {
        const id = await createStaffNotification({
          staffId: admin.id,
          category: 'MANAGEMENT',
          title: `Performance review due ${label}`,
          body: `The performance review for ${staffName} is due ${label} (${c.nextReviewDate?.toDateString()}).`,
          sourceId: `performance-reminder:${c.id}:${kind}`,
          sourceType: 'performance_review_reminder',
        })
        if (id) sent += 1
      }
      await logPerformanceHistory({ caseId: c.id, action: 'REMINDER_SENT', metadata: { kind } })
    }
  }

  return NextResponse.json({ ok: true, sent, dueIn7: dueIn7.length, dueToday: dueToday.length })
}
