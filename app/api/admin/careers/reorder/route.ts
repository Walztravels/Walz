import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── POST /api/admin/careers/reorder ──────────────────────────────────────────
// Body: { order: [{ id, sortOrder }, …] } — applied in ONE transaction so a
// partial reorder can never leave inconsistent results.
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({})) as { order?: Array<{ id?: unknown; sortOrder?: unknown }> }
    const order = Array.isArray(body.order) ? body.order : []
    if (order.length === 0) return NextResponse.json({ error: 'order array required' }, { status: 400 })

    const updates: Array<{ id: string; sortOrder: number }> = []
    for (const entry of order) {
      const id = typeof entry.id === 'string' ? entry.id : ''
      const n  = Number(entry.sortOrder)
      if (!id || !Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'Each entry needs an id and a non-negative integer sortOrder' }, { status: 400 })
      }
      updates.push({ id, sortOrder: n })
    }

    await prisma.$transaction(
      updates.map(u => prisma.jobOpening.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })),
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[careers reorder]', err)
    return NextResponse.json({ error: 'Failed to reorder job openings' }, { status: 500 })
  }
}
