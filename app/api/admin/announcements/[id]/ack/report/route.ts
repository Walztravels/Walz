import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { resolveAnnouncementRecipients } from '@/lib/staff-updates/audience'
import { requiresAcknowledgement } from '@/lib/staff-updates/priority'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

/**
 * Super Admin "Acknowledged X/Y outstanding" report for one announcement.
 *
 * Super Admin only — this is aggregate staff-level acknowledgement data,
 * not something any staff member should be able to pull for a colleague.
 * Reuses resolveAnnouncementRecipients() as the authoritative "who was
 * targeted" set, left-joined against AnnouncementAcknowledgement — the same
 * recipient-resolution function the notify orchestrator uses, so "targeted"
 * here can never silently diverge from "who actually got notified".
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ann = await prisma.staffAnnouncement.findUnique({
    where:  { id: params.id },
    select: {
      id: true, title: true, priority: true, status: true,
      audience: true, audienceRoles: true, audienceStaffIds: true,
    },
  })
  if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The outstanding-acknowledgement report only means something for
  // HIGH/URGENT ("Critical") announcements — NORMAL priority is read-tracked
  // only and was never required to be acknowledged, so there is nothing
  // meaningful to report "outstanding" against.
  if (!requiresAcknowledgement(ann.priority)) {
    return NextResponse.json(
      { error: 'Acknowledgement reporting only applies to HIGH/URGENT priority announcements' },
      { status: 400 },
    )
  }

  const recipients = await resolveAnnouncementRecipients(ann)

  const acks = await prisma.announcementAcknowledgement.findMany({
    where:  { announcementId: ann.id, staffId: { in: recipients.map(r => r.id) } },
    select: { staffId: true, readAt: true, acknowledgedAt: true },
  })
  const ackByStaffId = new Map(acks.map(a => [a.staffId, a]))

  const staff = recipients.map(r => {
    const ack = ackByStaffId.get(r.id)
    return {
      id:             r.id,
      name:           r.name,
      role:           r.role,
      department:     r.department,
      readAt:         ack?.readAt ?? null,
      acknowledgedAt: ack?.acknowledgedAt ?? null,
    }
  })

  const acknowledgedCount = staff.filter(s => s.acknowledgedAt).length
  const outstanding = staff.filter(s => !s.acknowledgedAt)

  return NextResponse.json({
    announcementId:    ann.id,
    title:             ann.title,
    priority:          ann.priority,
    totalTargeted:     staff.length,
    acknowledgedCount,
    outstandingCount:  outstanding.length,
    outstanding,
    staff,
  })
}
