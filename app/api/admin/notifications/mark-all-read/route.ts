import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await prisma.staffNotification.updateMany({
    where: { staffId: session.id, read: false, archived: false },
    data:  { read: true },
  })

  return NextResponse.json({ updated: result.count })
}
