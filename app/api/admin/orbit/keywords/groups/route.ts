import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const groups = await prisma.orbitKeywordGroup.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { keywords: true } } },
  })

  return NextResponse.json({ groups })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    name?: string; topic?: string; intent?: string; notes?: string
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!body.topic?.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 })

  const group = await prisma.orbitKeywordGroup.create({
    data: {
      name:   body.name.trim(),
      topic:  body.topic.trim(),
      intent: body.intent ?? 'informational',
      notes:  body.notes ?? '',
    },
  })

  return NextResponse.json({ group }, { status: 201 })
}
