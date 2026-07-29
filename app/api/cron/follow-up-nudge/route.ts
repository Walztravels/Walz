export const maxDuration = 30
export const dynamic    = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { getResend }                 from '@/lib/resend'

const ACTIVE_STATUSES = ['New', 'Contacted', 'In Progress']
const BASE_URL        = process.env.NEXTAUTH_URL || 'https://walztravels.com'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const overdueByStaff = await prisma.lead.groupBy({
    by:      ['assignedToId'],
    where:   {
      assignedToId:   { not: null },
      status:         { in: ACTIVE_STATUSES },
      nextFollowUpAt: { lte: new Date(today.getTime() + 86_400_000) }, // overdue + today
    },
    _count: { id: true },
  })

  // Skip staff with zero due
  if (!overdueByStaff.length) {
    return NextResponse.json({ message: 'No nudges needed today', sent: 0 })
  }

  const staffIds = overdueByStaff
    .filter(r => r.assignedToId != null)
    .map(r => r.assignedToId!)

  const staffMembers = await prisma.staff.findMany({
    where:  { id: { in: staffIds }, isActive: true },
    select: { id: true, name: true, email: true },
  })

  const countMap = new Map(overdueByStaff.map(r => [r.assignedToId, r._count.id]))

  let sent = 0
  for (const staff of staffMembers) {
    const count = countMap.get(staff.id) ?? 0
    if (count === 0) continue

    try {
      await getResend().emails.send({
        from:    'Walz Staff <contact@walztravels.com>',
        to:      staff.email,
        subject: `📋 You have ${count} follow-up${count > 1 ? 's' : ''} due today`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0B1F3A;padding:32px;border-radius:12px">
            <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px">Walz Travels</p>
            <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 8px">
              Good morning, ${staff.name.split(' ')[0]}
            </h2>
            <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px">
              You have <strong style="color:#f59e0b">${count} lead${count > 1 ? 's' : ''}</strong> due for follow-up today (including any overdue).
            </p>
            <a href="${BASE_URL}/admin/my-followups"
               style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
              View My Follow-ups →
            </a>
            <p style="color:#475569;font-size:12px;margin:24px 0 0">
              This is an automated reminder. Replies go to contact@walztravels.com
            </p>
          </div>
        `,
      })
      sent++
    } catch (err: any) {
      console.error('[follow-up-nudge] Failed for', staff.email, err?.message)
    }
  }

  return NextResponse.json({ sent, staffNotified: staffMembers.length })
}
