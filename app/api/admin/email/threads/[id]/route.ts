import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getVisibleSentByIds } from '@/lib/email-hub'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/email/threads/[id] ────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const visibleIds = await getVisibleSentByIds(session.staffRole, session.id)

    // findFirst enforces visibility at the query level — if this viewer can't
    // see the thread, it returns null (404) rather than 403, which avoids
    // leaking whether the thread ID exists at all.
    const thread = await prisma.emailThread.findFirst({
      where: {
        id: params.id,
        OR: [
          { messages: { some: { sentBy: { in: visibleIds } } } },
          { messages: { none: { sentBy: { not: null } } } },
        ],
      },
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
    // Verify visibility before allowing a write — same rule as the GET.
    const visibleIds = await getVisibleSentByIds(session.staffRole, session.id)
    const accessible = await prisma.emailThread.findFirst({
      where: {
        id: params.id,
        OR: [
          { messages: { some: { sentBy: { in: visibleIds } } } },
          { messages: { none: { sentBy: { not: null } } } },
        ],
      },
      select: { id: true },
    })
    if (!accessible) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
