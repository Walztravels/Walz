import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { validateOpening } from '@/lib/careers'

export const dynamic = 'force-dynamic'

// ── PATCH /api/admin/careers/[id] — edit fields or toggle active ─────────────
// There is deliberately no DELETE: openings are deactivated, never destroyed,
// so listing history is preserved.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateOpening(body, true)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    if (Object.keys(v.value).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }
    const item = await prisma.jobOpening.update({ where: { id: params.id }, data: v.value })
    return NextResponse.json({ item })
  } catch (err) {
    console.error('[careers PATCH]', err)
    return NextResponse.json({ error: 'Failed to update job opening' }, { status: 500 })
  }
}
