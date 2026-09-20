import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

const MIN_QUERY_CHARS = 2
const MAX_RESULTS = 30

/**
 * Message search. The membership filter is INSIDE the query (`conversation:
 * { members: { some: { staffId, leftAt: null } } }`), never a post-hoc
 * filter on fetched results — a private channel/DM the caller isn't in can
 * never surface here regardless of how the query is otherwise shaped.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Security review finding (HIGH): search had no rate limit — an unbounded
  // enumeration/scraping vector even though every result is still
  // correctly membership-scoped.
  const rl = rateLimit({ key: `team-search:${session.email}`, limit: 60, windowMs: 5 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many searches — please slow down.' }, { status: 429 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < MIN_QUERY_CHARS) return NextResponse.json({ results: [] })

  const staffId = currentStaffId(session)
  // Escape Prisma/Postgres LIKE metacharacters so a query like "50%" or
  // "foo_bar" matches those literal characters instead of being
  // interpreted as a wildcard (QA finding — over-matching, not a security
  // issue, but a correctness one).
  const likeSafeQuery = q.replace(/[\\%_]/g, (ch) => `\\${ch}`)

  const results = await prisma.teamMessage.findMany({
    where: {
      deletedAt: null,
      body: { contains: likeSafeQuery, mode: 'insensitive' },
      conversation: { members: { some: { staffId, leftAt: null } } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_RESULTS,
    include: {
      author: { select: { id: true, name: true } },
      conversation: { select: { id: true, type: true, name: true } },
    },
  })

  return NextResponse.json({
    results: results.map(m => ({
      messageId: m.id,
      conversationId: m.conversationId,
      conversationType: m.conversation.type,
      conversationName: m.conversation.name,
      authorName: m.author.name,
      body: m.body,
      createdAt: m.createdAt,
    })),
  })
}
