import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// GET /api/admin/activity  — recent activity logs (last 100)
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, staffName: true, action: true, detail: true, createdAt: true,
    },
  })

  return NextResponse.json({ logs })
}
