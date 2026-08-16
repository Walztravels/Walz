import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    name?: string; topic?: string; intent?: string; notes?: string
  }

  const group = await prisma.orbitKeywordGroup.update({
    where: { id: params.groupId },
    data: {
      ...(body.name   && { name:   body.name.trim() }),
      ...(body.topic  && { topic:  body.topic.trim() }),
      ...(body.intent && { intent: body.intent }),
      ...(body.notes  !== undefined && { notes: body.notes }),
    },
  })

  return NextResponse.json({ group })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitKeywordGroup.delete({ where: { id: params.groupId } })
  return NextResponse.json({ ok: true })
}
