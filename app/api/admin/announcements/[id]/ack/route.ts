import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { isAnnouncementEligible } from '@/lib/staff-updates/audience'
import { requiresAcknowledgement } from '@/lib/staff-updates/priority'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

/**
 * Read/acknowledgement tracking for a single staff member's own record on
 * one announcement.
 *
 * Identity is ALWAYS taken from the authenticated session (getAdminSession),
 * never from the request body or URL — a staff member can only ever read or
 * write their own AnnouncementAcknowledgement row. There is no staffId
 * parameter anywhere in this route.
 */

export async function GET(_req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.announcementAcknowledgement.findUnique({
    where: { announcementId_staffId: { announcementId: params.id, staffId: session.id } },
    select: { readAt: true, acknowledgedAt: true },
  })

  return NextResponse.json({
    readAt:         row?.readAt ?? null,
    acknowledgedAt: row?.acknowledgedAt ?? null,
  })
}

export async function POST(req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action

  if (action !== 'read' && action !== 'acknowledge') {
    return NextResponse.json({ error: 'action must be "read" or "acknowledge"' }, { status: 400 })
  }

  const ann = await prisma.staffAnnouncement.findUnique({
    where:  { id: params.id },
    select: {
      id: true, status: true, priority: true,
      audience: true, audienceRoles: true, audienceStaffIds: true,
    },
  })
  if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only a PUBLISHED announcement can be read/acknowledged — there is
  // nothing legitimate to acknowledge in a DRAFT/APPROVED/ARCHIVED one.
  if (ann.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Announcement is not published' }, { status: 409 })
  }

  // NORMAL priority is read-tracked only — formal acknowledgement is a
  // HIGH/URGENT ("Critical") requirement per spec. "read" is always fine;
  // "acknowledge" on a NORMAL announcement is rejected rather than silently
  // accepted, so this enforcement can't quietly drift from what the UI shows.
  if (action === 'acknowledge' && !requiresAcknowledgement(ann.priority)) {
    return NextResponse.json(
      { error: 'Acknowledgement is not required for NORMAL priority announcements — use action "read"' },
      { status: 400 },
    )
  }

  // Staff may only acknowledge announcements that actually target them —
  // an admin viewing something outside their own audience cannot manufacture
  // an acknowledgement record for it. isAnnouncementEligible is the same
  // pure predicate used to resolve who got notified in the first place, so
  // "eligible to acknowledge" can never diverge from "was notified".
  const eligible = isAnnouncementEligible(
    { id: session.id, role: session.role, department: session.department },
    ann,
  )
  if (!eligible) {
    return NextResponse.json({ error: 'Forbidden — you are not a recipient of this announcement' }, { status: 403 })
  }

  const now = new Date()
  const data =
    action === 'acknowledge'
      ? { readAt: now, acknowledgedAt: now } // acknowledging implies having read it
      : { readAt: now }

  const row = await prisma.announcementAcknowledgement.upsert({
    where:  { announcementId_staffId: { announcementId: ann.id, staffId: session.id } },
    // Never let a later "read" overwrite an earlier "acknowledge" — update
    // only sets fields explicitly passed for this call.
    update: action === 'read'
      ? { readAt: now }
      : { readAt: now, acknowledgedAt: now },
    create: {
      announcementId: ann.id,
      staffId:        session.id,
      ...data,
    },
    select: { readAt: true, acknowledgedAt: true },
  })

  return NextResponse.json(row)
}
