import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { validateOpening } from '@/lib/careers'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/careers — every opening, including inactive ───────────────
export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const items = await prisma.jobOpening.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[careers GET]', err)
    return NextResponse.json({ error: 'Failed to load job openings' }, { status: 500 })
  }
}

// ── POST /api/admin/careers — create an opening ──────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateOpening(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const item = await prisma.jobOpening.create({
      data: {
        title:       v.value.title!,
        type:        v.value.type!,
        location:    v.value.location!,
        description: v.value.description!,
        isActive:    v.value.isActive ?? true,
        sortOrder:   v.value.sortOrder ?? 0,
        createdBy:   session.email,
      },
    })
    return NextResponse.json({ item })
  } catch (err) {
    console.error('[careers POST]', err)
    return NextResponse.json({ error: 'Failed to create job opening' }, { status: 500 })
  }
}
