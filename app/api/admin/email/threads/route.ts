import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getVisibleSentByIds } from '@/lib/email-hub'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/email/threads ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? 'inbox'
  const status   = searchParams.get('status')   ?? 'open'
  const search   = searchParams.get('search')   ?? ''

  try {
    // Resolve which staff IDs this viewer may see based on the role hierarchy.
    // A thread is visible if the viewer (or someone below them) sent a message
    // in it, or if the thread has no staff-sent messages at all (pure inbound).
    const visibleIds = await getVisibleSentByIds(session.staffRole, session.id)

    const where: Record<string, unknown> = {
      category,
      status,
      OR: [
        { messages: { some: { sentBy: { in: visibleIds } } } },
        // Pure inbound threads (no staff sentBy) are visible to all staff.
        { messages: { none: { sentBy: { not: null } } } },
      ],
    }
    if (search) {
      where.subject = { contains: search, mode: 'insensitive' }
    }

    const threads = await prisma.emailThread.findMany({
      where,
      orderBy: { lastEmailAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            bodyText:   true,
            direction:  true,
            from:       true,
            fromName:   true,
            sentAt:     true,
            receivedAt: true,
            readAt:     true,
          },
        },
      },
    })

    return NextResponse.json({ threads })
  } catch (err) {
    console.error('[email/threads GET]', err)
    return NextResponse.json({ error: 'Failed to load threads' }, { status: 500 })
  }
}

// ── POST /api/admin/email/threads ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    subject:       string
    category?:     string
    participants?: unknown[]
    refType?:      string
    refId?:        string
  }

  if (!body.subject) {
    return NextResponse.json({ error: 'subject is required' }, { status: 400 })
  }

  try {
    const thread = await prisma.emailThread.create({
      data: {
        subject:      body.subject,
        category:     body.category     ?? 'inbox',
        status:       'open',
        participants: (body.participants ?? []) as object[],
        refType:      body.refType      ?? null,
        refId:        body.refId        ?? null,
        lastEmailAt:  new Date(),
      },
    })

    return NextResponse.json({ thread }, { status: 201 })
  } catch (err) {
    console.error('[email/threads POST]', err)
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
  }
}
