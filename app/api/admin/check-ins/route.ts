import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const ADMIN_ROLES = new Set(['super_admin', 'operations_manager', 'general_manager', 'senior_manager'])

export async function GET(req: Request) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const staffId   = searchParams.get('staffId') ?? undefined
    const flagged   = searchParams.get('flagged') === 'true' ? true : undefined
    const from      = searchParams.get('from')
    const to        = searchParams.get('to')
    const pageStr   = searchParams.get('page') ?? '1'
    const page      = Math.max(1, parseInt(pageStr, 10))
    const limit     = 50

    // Non-admins can only see their own records
    const isAdmin = ADMIN_ROLES.has(session.role)
    const resolvedStaffId = isAdmin ? staffId : session.staffId

    const where: Record<string, unknown> = {}
    if (resolvedStaffId) where.staffId = resolvedStaffId
    if (flagged !== undefined) where.flagged = flagged
    if (from || to) {
      where.windowStart = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      }
    }

    const [records, total, flaggedCount, waivedCount] = await Promise.all([
      prisma.checkInRecord.findMany({
        where,
        include: { staff: { select: { id: true, name: true, role: true, roleTitle: true } } },
        orderBy: { windowStart: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.checkInRecord.count({ where }),
      prisma.checkInRecord.count({ where: { ...where, flagged: true, waived: false } }),
      prisma.checkInRecord.count({ where: { ...where, flagged: true, waived: true  } }),
    ])

    return NextResponse.json({ records, total, flaggedCount, waivedCount, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[check-ins GET]', err)
    return NextResponse.json({ error: 'Failed to load check-in records', records: [], total: 0, flaggedCount: 0, waivedCount: 0, page: 1, pages: 0 }, { status: 500 })
  }
}
