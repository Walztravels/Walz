import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const filter   = searchParams.get('filter') ?? 'unread' // unread|all|important|archived
  const page     = parseInt(searchParams.get('page') ?? '1', 10)
  const limit    = parseInt(searchParams.get('limit') ?? '20', 10)

  const where: Record<string, unknown> = { staffId: session.id }

  if (filter === 'unread')    { where.read = false; where.archived = false }
  if (filter === 'important') { where.important = true; where.archived = false }
  if (filter === 'archived')  { where.archived = true }
  if (filter === 'all')       { where.archived = false }

  if (category && category !== 'all') where.category = category

  const [items, total] = await Promise.all([
    prisma.staffNotification.findMany({
      where,
      orderBy: [{ important: 'desc' }, { createdAt: 'desc' }],
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.staffNotification.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}
