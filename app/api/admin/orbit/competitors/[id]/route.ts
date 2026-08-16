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

  const competitor = await prisma.orbitCompetitor.findUnique({
    where: { id: params.id },
    include: {
      snapshots: { orderBy: { recordedAt: 'desc' }, take: 10 },
    },
  })
  if (!competitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ competitor })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Soft delete
  await prisma.orbitCompetitor.update({
    where: { id: params.id },
    data:  { active: false },
  })
  return NextResponse.json({ ok: true })
}
