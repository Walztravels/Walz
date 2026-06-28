import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const hiveSession = await prisma.groupHiveSession.findUnique({
    where: { id: params.id },
    include: { members: { orderBy: { slotNumber: 'asc' } } },
  })

  if (!hiveSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ session: hiveSession })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  await prisma.groupHiveSession.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
