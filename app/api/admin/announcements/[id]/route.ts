import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { notifyAnnouncementPublished } from '@/lib/staff-updates/notify'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

function isAdmin(role: string) {
  return ['super_admin', 'admin'].includes(role)
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ann = await prisma.staffAnnouncement.findUnique({
    where: { id: params.id },
    include: { author: { select: { name: true, email: true } } },
  })
  if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Non-admins may only see published items
  if (!isAdmin(session.role) && ann.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ announcement: ann })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.staffAnnouncement.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const wasPublished = existing.status !== 'PUBLISHED'
  const nowPublished = body.status === 'PUBLISHED'

  const updated = await prisma.staffAnnouncement.update({
    where: { id: params.id },
    data: {
      ...(body.title        !== undefined && { title:        body.title }),
      ...(body.category     !== undefined && { category:     body.category }),
      ...(body.summary      !== undefined && { summary:      body.summary }),
      ...(body.detail       !== undefined && { detail:       body.detail }),
      ...(body.whatToDo     !== undefined && { whatToDo:     body.whatToDo }),
      ...(body.effectiveDate !== undefined && {
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
      }),
      ...(body.relevantUrl   !== undefined && { relevantUrl:   body.relevantUrl }),
      ...(body.audience      !== undefined && { audience:      body.audience }),
      ...(body.audienceRoles !== undefined && { audienceRoles: body.audienceRoles }),
      ...(body.audienceStaffIds !== undefined && { audienceStaffIds: body.audienceStaffIds }),
      ...(body.priority      !== undefined && { priority:      body.priority }),
      ...(body.status        !== undefined && { status:        body.status }),
      ...(nowPublished && wasPublished && { publishedAt: new Date() }),
    },
  })

  // If transitioning to PUBLISHED for the first time, fan out in-app
  // notifications + transactional emails. Best-effort: a delivery failure
  // must never fail this PATCH response — the announcement is already
  // committed as PUBLISHED above regardless of notify outcome.
  let notify: Awaited<ReturnType<typeof notifyAnnouncementPublished>> | null = null
  if (nowPublished && wasPublished) {
    try {
      notify = await notifyAnnouncementPublished(
        {
          id:               updated.id,
          title:            updated.title,
          summary:          updated.summary,
          category:         updated.category,
          priority:         updated.priority,
          effectiveDate:    updated.effectiveDate,
          audience:         updated.audience,
          audienceRoles:    updated.audienceRoles,
          audienceStaffIds: updated.audienceStaffIds,
        },
        { staffId: session.id, staffName: session.name, staffRole: session.role },
      )
    } catch (err) {
      console.warn(`[announcements] notify failed announcementId=${updated.id}:`, (err as Error).message)
    }
  }

  return NextResponse.json({ announcement: updated, notify })
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['super_admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Archive instead of hard-delete to preserve notification history
  const updated = await prisma.staffAnnouncement.update({
    where: { id: params.id },
    data:  { status: 'ARCHIVED' },
  })

  return NextResponse.json({ announcement: updated })
}
