import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// GET /api/admin/activity
// Supports: page, limit, staffId, action, search, startDate, endDate
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page      = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const staffId   = searchParams.get('staffId')
  const action    = searchParams.get('action')
  const search    = searchParams.get('search') ?? ''
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  const where: Record<string, unknown> = {}

  if (staffId)   where.staffId = staffId
  if (action)    where.action  = action
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate   ? { lte: new Date(endDate + 'T23:59:59.999Z') } : {}),
    }
  }
  if (search) {
    where.OR = [
      { staffName: { contains: search, mode: 'insensitive' } },
      { action:    { contains: search, mode: 'insensitive' } },
      { detail:    { contains: search, mode: 'insensitive' } },
    ]
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
      select: {
        id: true, staffId: true, staffName: true, action: true,
        detail: true, ipAddress: true, createdAt: true,
      },
    }),
    prisma.activityLog.count({ where }),
  ])

  // Unique staff list for filter dropdown
  const staff = await prisma.activityLog.findMany({
    where: { staffId: { not: null } },
    select: { staffId: true, staffName: true },
    distinct: ['staffId'],
  })

  // Unique action types for filter dropdown
  const actionTypes = await prisma.activityLog.findMany({
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  })

  return NextResponse.json({ logs, total, page, limit, staff, actionTypes: actionTypes.map(a => a.action) })
}

// POST /api/admin/activity — log a new action
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { staffId, staffName, action, detail, ipAddress } = await req.json()
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const log = await prisma.activityLog.create({
    data: { staffId, staffName, action, detail, ipAddress },
  })

  return NextResponse.json({ log }, { status: 201 })
}
