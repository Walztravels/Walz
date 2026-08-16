import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const kw = await prisma.orbitKeyword.findUnique({
    where: { id: params.id },
    include: {
      group: true,
      rankings: { orderBy: { recordedAt: 'desc' }, take: 30 },
    },
  })
  if (!kw) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ keyword: kw })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const kw = await prisma.orbitKeyword.update({
    where: { id: params.id },
    data: {
      ...(body.groupId        !== undefined && { groupId:        body.groupId        as string | null }),
      ...(body.intent         !== undefined && { intent:         body.intent         as string }),
      ...(body.linkedPageSlug !== undefined && { linkedPageSlug: body.linkedPageSlug as string | null }),
      ...(body.notes          !== undefined && { notes:          body.notes          as string }),
      ...(body.volume         !== undefined && { volume:         body.volume         as number | null }),
      ...(body.difficulty     !== undefined && { difficulty:     body.difficulty     as number | null }),
      ...(body.cpc            !== undefined && { cpc:            body.cpc            as number | null }),
    },
  })

  return NextResponse.json({ keyword: kw })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.orbitKeyword.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
