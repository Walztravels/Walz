import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const brief = await prisma.jadeDailyBrief.findUnique({
    where: { briefDate: today },
  })

  if (!brief) {
    return NextResponse.json({ brief: null })
  }

  // Check if this staff member has read today's brief notification
  const notification = await prisma.staffNotification.findFirst({
    where: {
      staffId:    session.id,
      sourceType: 'brief',
      sourceId:   brief.id,
    },
    select: { id: true, read: true },
  })

  return NextResponse.json({
    brief: {
      id:                brief.id,
      briefDate:         brief.briefDate,
      motivation:        brief.motivation,
      motivationThought: brief.motivationThought,
      motivationTheme:   brief.motivationTheme,
      contentJson:       brief.contentJson,
      generatedAt:       brief.generatedAt,
    },
    read:           notification?.read ?? false,
    notificationId: notification?.id ?? null,
  })
}
