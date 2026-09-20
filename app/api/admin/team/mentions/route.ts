import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * "My mentions" feed. A TeamMention row is created only when the mentioned
 * staff member was an active conversation member AT SEND TIME (see the
 * messages route), but membership can change afterward — so this ALSO
 * re-filters to conversations the caller is CURRENTLY a member of, via the
 * membership-join condition below, never trusting the historical mention
 * row alone as proof of present-day access.
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = currentStaffId(session)

  const mentions = await prisma.teamMention.findMany({
    where: {
      mentionedStaffId: staffId,
      message: { deletedAt: null, conversation: { members: { some: { staffId, leftAt: null } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    include: {
      message: {
        select: {
          id: true, conversationId: true, body: true, createdAt: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  })

  return NextResponse.json({
    mentions: mentions.map(m => ({
      messageId: m.message.id,
      conversationId: m.message.conversationId,
      authorName: m.message.author.name,
      body: m.message.body,
      createdAt: m.message.createdAt,
    })),
  })
}
