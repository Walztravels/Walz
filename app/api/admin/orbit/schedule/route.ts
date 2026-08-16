import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const type   = searchParams.get('type')
  const status = searchParams.get('status')

  const items = await prisma.orbitScheduleItem.findMany({
    where: {
      ...(from   && { scheduledAt: { gte: new Date(from) } }),
      ...(to     && { scheduledAt: { lte: new Date(to)   } }),
      ...(type   && { type }),
      ...(status && { status }),
    },
    orderBy: { scheduledAt: 'asc' },
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    type?: string; title?: string; scheduledAt?: string
    refId?: string; refType?: string; platform?: string; metadata?: Record<string, unknown>
  }

  if (!body.type?.trim())        return NextResponse.json({ error: 'type required' }, { status: 400 })
  if (!body.title?.trim())       return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!body.scheduledAt)         return NextResponse.json({ error: 'scheduledAt required' }, { status: 400 })

  const item = await prisma.orbitScheduleItem.create({
    data: {
      type:        body.type,
      title:       body.title,
      scheduledAt: new Date(body.scheduledAt),
      refId:       body.refId    ?? undefined,
      refType:     body.refType  ?? undefined,
      platform:    body.platform ?? undefined,
      metadata:    (body.metadata ?? {}) as object,
      createdBy:   session.email,
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}
