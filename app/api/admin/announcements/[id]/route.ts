import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

function isAdmin(role: string) {
  return ['super_admin', 'admin'].includes(role)
}

function isEligible(
  staff: { role: string; department: string; id: string },
  ann: { audience: string; audienceRoles: string[]; audienceStaffIds: string[] },
) {
  switch (ann.audience) {
    case 'EVERYONE':           return true
    case 'SALES':              return staff.department === 'sales'
    case 'VISA_TEAM':          return staff.department === 'visa'
    case 'TRAVEL_CONSULTANTS': return ['flights','tours','hotels'].includes(staff.department)
    case 'FINANCE':            return staff.department === 'accounts'
    case 'ADMIN_TEAM':         return ['super_admin','admin'].includes(staff.role)
    case 'MANAGEMENT':         return ['super_admin','manager','general_manager'].includes(staff.role)
    case 'SPECIFIC_ROLE':      return ann.audienceRoles.includes(staff.role)
    case 'SPECIFIC_STAFF':     return ann.audienceStaffIds.includes(staff.id)
    default:                   return true
  }
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

  // If transitioning to PUBLISHED for the first time, create staff notifications
  if (nowPublished && wasPublished) {
    const annForEligibility = {
      audience:        updated.audience,
      audienceRoles:   updated.audienceRoles,
      audienceStaffIds: updated.audienceStaffIds,
    }

    const allStaff = await prisma.staff.findMany({
      where:  { isActive: true },
      select: { id: true, role: true, department: true },
    })

    const today = new Date().toISOString().split('T')[0]
    for (const staff of allStaff) {
      if (!isEligible(staff, annForEligibility)) continue
      const channel = `ann_${updated.id}`
      const already = await prisma.briefDeliveryLog.findUnique({
        where: { briefDate_staffId_channel: { briefDate: today, staffId: staff.id, channel } },
      })
      if (already) continue

      try {
        await prisma.staffNotification.create({
          data: {
            staffId:    staff.id,
            category:   'SYSTEM',
            title:      updated.title,
            body:       updated.summary,
            important:  updated.priority === 'URGENT',
            sourceId:   updated.id,
            sourceType: 'announcement',
          },
        })
        await prisma.briefDeliveryLog.create({
          data: { briefDate: today, staffId: staff.id, channel },
        })
      } catch {
        // idempotent
      }
    }
  }

  return NextResponse.json({ announcement: updated })
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
