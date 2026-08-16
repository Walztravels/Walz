import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/email/threads/[id] ────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const thread = await prisma.emailThread.findUnique({
      where:   { id: params.id },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
      },
    })

    if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ thread })
  } catch (err) {
    console.error('[email/threads/[id] GET]', err)
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 500 })
  }
}

// ── PATCH /api/admin/email/threads/[id] ──────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    assignedTo?: string | null
    status?:     string
    category?:   string
  }

  const data: Record<string, unknown> = {}
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
  if (body.status    !== undefined)  data.status    = body.status
  if (body.category  !== undefined)  data.category  = body.category

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const thread = await prisma.emailThread.update({
      where: { id: params.id },
      data,
    })
    return NextResponse.json({ thread })
  } catch (err) {
    console.error('[email/threads/[id] PATCH]', err)
    return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
  }
}
