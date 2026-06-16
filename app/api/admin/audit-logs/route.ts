import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasPermission(session, 'audit_logs')) {
    return NextResponse.json({ error: 'Forbidden — audit_logs permission required' }, { status: 403 })
  }

  const url      = new URL(req.url)
  const module   = url.searchParams.get('module')
  const staffId  = url.searchParams.get('staffId')
  const from     = url.searchParams.get('from')
  const page     = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))

  const where: Record<string, unknown> = {}
  if (module)  where.module   = module
  if (staffId) where.staffId  = staffId
  if (from)    where.createdAt = { gte: new Date(from) }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    50,
      skip:    (page - 1) * 50,
      include: { staff: { select: { name: true, role: true } } },
    }),
    prisma.activityLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page })
}
