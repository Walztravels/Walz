import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '50'))

  const [logs, total] = await Promise.all([
    prisma.staffLoginLog.findMany({
      orderBy: { loginAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.staffLoginLog.count(),
  ])

  return NextResponse.json({ logs, total, page, limit })
}
