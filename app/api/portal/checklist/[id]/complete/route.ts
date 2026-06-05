import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify item belongs to user's application
  const item = await prisma.checklistItem.findUnique({
    where: { id: params.id },
    include: { application: { select: { userId: true } } },
  })

  if (!item || item.application.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.checklistItem.update({
    where: { id: params.id },
    data: {
      completedAt: item.completedAt ? null : new Date(),
      completedBy: item.completedAt ? null : 'client',
    },
  })

  return NextResponse.json({ item: updated })
}
