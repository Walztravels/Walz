import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// POST { order: [{ id, sortOrder }] } — single transaction, no partial reorder
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.jobs.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({})) as { order?: Array<{ id?: unknown; sortOrder?: unknown }> }
    const order = Array.isArray(body.order) ? body.order : []
    if (order.length === 0) return NextResponse.json({ error: 'order array required' }, { status: 400 })

    const updates: Array<{ id: string; sortOrder: number }> = []
    for (const e of order) {
      const id = typeof e.id === 'string' ? e.id : ''
      const n = Number(e.sortOrder)
      if (!id || !Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'Each entry needs an id and non-negative integer sortOrder' }, { status: 400 })
      }
      updates.push({ id, sortOrder: n })
    }

    await prisma.$transaction(
      updates.map(u => prisma.jobOpening.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })),
    )
    await recruitmentAudit(session, 'Jobs Reordered', `${updates.length} jobs`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[recruitment reorder]', err)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}
