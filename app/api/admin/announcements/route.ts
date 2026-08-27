import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // DRAFT|APPROVED|PUBLISHED|ARCHIVED|all
  const page   = parseInt(searchParams.get('page') ?? '1', 10)
  const limit  = 20

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status

  // Non-super-admins only see published announcements
  if (!['super_admin', 'admin'].includes(session.role)) {
    where.status = 'PUBLISHED'
  }

  const [items, total] = await Promise.all([
    prisma.staffAnnouncement.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id: true, title: true, category: true, summary: true,
        audience: true, priority: true, status: true,
        effectiveDate: true, publishedAt: true, createdAt: true,
        author: { select: { name: true } },
      },
    }),
    prisma.staffAnnouncement.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['super_admin', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    title, category, summary, detail, whatToDo,
    effectiveDate, relevantUrl, audience, audienceRoles,
    audienceStaffIds, priority, status,
  } = body

  if (!title || !category || !summary || !detail) {
    return NextResponse.json({ error: 'title, category, summary and detail are required' }, { status: 400 })
  }

  const ann = await prisma.staffAnnouncement.create({
    data: {
      title,
      category,
      summary,
      detail,
      whatToDo:        whatToDo ?? null,
      effectiveDate:   effectiveDate ? new Date(effectiveDate) : null,
      relevantUrl:     relevantUrl ?? null,
      audience:        audience ?? 'EVERYONE',
      audienceRoles:   audienceRoles ?? [],
      audienceStaffIds: audienceStaffIds ?? [],
      priority:        priority ?? 'NORMAL',
      status:          status ?? 'DRAFT',
      publishedAt:     status === 'PUBLISHED' ? new Date() : null,
      authorId:        session.id,
    },
  })

  return NextResponse.json({ announcement: ann })
}
