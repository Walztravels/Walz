import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership } from '@/lib/team/authz'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

/**
 * NEW FILE — not part of the five prior implementation passes. Added by the
 * UI pass because no existing endpoint lets the Team Hub SIDE discover
 * "does any message in this conversation already have an inbox-link" — the
 * existing GET .../inbox-link route (singular) requires already knowing the
 * target Chatwoot conversation id, which is exactly what this is for
 * finding out. Read-only, additive, new path — does not modify
 * .../inbox-link/route.ts. Used by ConversationHeader.tsx to show a
 * "Linked to client conversation" banner/chip when applicable.
 *
 * Same LOGICAL-AND authorization discipline as the sibling route: (a) real
 * Team Hub membership on THIS conversation, AND (b) real, current Inbox
 * authorization on each link's OWN target conversation, checked
 * independently per link — a link the caller has no Inbox access to is
 * silently omitted from the list, never included and never used to fail
 * the whole request.
 */

interface SerializedLink {
  id: string
  messageId: string
  inboxConversationId: number
  status: string
  createdAt: Date
  updatedAt: Date
}

function serializeLink(link: {
  id: string; messageId: string; chatwootConversationId: number
  status: string; createdAt: Date; updatedAt: Date
}): SerializedLink {
  return {
    id: link.id,
    messageId: link.messageId,
    inboxConversationId: link.chatwootConversationId,
    status: link.status,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const inboxPerm = checkInboxPermission(session, 'inbox_view')
  if (!inboxPerm.allowed) return NextResponse.json({ links: [] }) // no Inbox access at all — nothing to show, not an error

  const links = await prisma.teamInboxDiscussionLink.findMany({
    where: { message: { conversationId: params.id } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  if (links.length === 0) return NextResponse.json({ links: [] })

  const accessible = await Promise.all(
    links.map(async link => {
      const access = await checkConversationAccess(session as AdminSession, String(link.chatwootConversationId))
      return access.allowed ? link : null
    }),
  )

  return NextResponse.json({ links: accessible.filter((l): l is NonNullable<typeof l> => l !== null).map(serializeLink) })
}
