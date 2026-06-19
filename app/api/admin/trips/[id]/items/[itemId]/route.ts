import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { itemId } = await params
  const data = await req.json()
  const item = await prisma.tripItem.update({
    where: { id: itemId },
    data: {
      ...data,
      cost: data.cost !== undefined ? parseFloat(String(data.cost)) : undefined,
    },
  })
  return NextResponse.json({ item })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { itemId } = await params
  await prisma.tripItem.delete({ where: { id: itemId } })
  return NextResponse.json({ ok: true })
}
