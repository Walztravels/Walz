import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 })

  const [notifications, unreadCount] = await Promise.all([
    prisma.portalNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.portalNotification.count({
      where: { userId: user.id, read: false },
    }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json() as { notificationId?: string; markAllRead?: boolean }

  if (body.markAllRead) {
    await prisma.portalNotification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    })
  } else if (body.notificationId) {
    await prisma.portalNotification.updateMany({
      where: { id: body.notificationId, userId: user.id },
      data: { read: true },
    })
  }

  return NextResponse.json({ success: true })
}
