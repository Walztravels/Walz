import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page   = parseInt(searchParams.get('page') ?? '1')
  const limit  = 50
  const search = searchParams.get('search') ?? ''

  const where = search
    ? { email: { contains: search, mode: 'insensitive' as const } }
    : {}

  const [subscribers, total, active, thisMonth] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { active: true } }),
    prisma.newsletterSubscriber.count({
      where: {
        subscribedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ])

  return NextResponse.json({ subscribers, total, active, thisMonth })
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, active } = await req.json()
  await prisma.newsletterSubscriber.update({ where: { id }, data: { active } })
  return NextResponse.json({ ok: true })
}
