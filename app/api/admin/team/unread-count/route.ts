import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

/**
 * GET — total unread Team Hub message count across every conversation the
 * caller currently belongs to, for the sidebar badge (mirrors the shape of
 * app/api/admin/notifications/unread-count/route.ts).
 *
 * Deliberately NOT one query per conversation (N+1) — each membership row
 * carries its own read-cursor threshold (lastReadAt, falling back to
 * joinedAt for a member who has never bumped the cursor — see
 * TeamConversationMember's schema comment), so this issues exactly two
 * bounded queries: one to fetch the caller's own membership rows, and one
 * `count()` whose OR clause evaluates each conversation's threshold in a
 * single database round trip.
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = currentStaffId(session)

  const memberships = await prisma.teamConversationMember.findMany({
    where: { staffId, leftAt: null },
    select: { conversationId: true, lastReadAt: true, joinedAt: true },
  })
  if (memberships.length === 0) return NextResponse.json({ unreadCount: 0 })

  const unreadCount = await prisma.teamMessage.count({
    where: {
      deletedAt: null,
      authorId: { not: staffId },
      OR: memberships.map(m => ({
        conversationId: m.conversationId,
        createdAt: { gt: m.lastReadAt ?? m.joinedAt },
      })),
    },
  })

  return NextResponse.json({ unreadCount })
}
