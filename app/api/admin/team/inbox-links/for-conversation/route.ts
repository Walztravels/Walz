import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership } from '@/lib/team/authz'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

/**
 * Floating Ask Team Workspace — CASE 1/2/3 reverse lookup.
 *
 * NEW FILE, additive, read-only. Neither existing inbox-link route can
 * answer "given an INBOX conversation id, is there already an open Team
 * Hub discussion linked to it, regardless of which Team conversation it is
 * on" — the singular `.../conversations/[id]/inbox-link` route requires
 * already knowing the Team conversation id, and the plural
 * `.../conversations/[id]/inbox-links` route requires it too (it walks the
 * OTHER direction: one Team conversation -> its inbox links). This is the
 * missing direction. It creates nothing — it only lets the floating
 * workspace decide whether "Ask Team" should focus/open an existing
 * discussion (CASE 1/2) or fall through to AskTeamPanel's existing
 * create-and-link flow (CASE 3).
 *
 * Same LOGICAL-AND authorization discipline as the sibling routes:
 *   (a) checkInboxPermission('inbox_view') + checkConversationAccess — real,
 *       current Inbox authorization on the TARGET inbox conversation.
 *   (b) checkConversationMembership — re-verified per CANDIDATE link's own
 *       Team conversation id, independently, most-recent first. A link
 *       whose Team conversation the caller is not (or no longer) a member
 *       of is silently skipped, never exposed and never used to fail the
 *       whole request — mirrors the plural route's per-link filtering.
 *
 * Only non-RESOLVED links are considered — a RESOLVED discussion is
 * deliberately NOT reopened by "Ask Team"; the caller falls through to
 * CASE 3 and starts a fresh discussion, mirroring the existing "Mark
 * resolved" semantics in AskTeamPanel/ConversationHeader.
 */

function parseInboxConversationId(raw: string | null): number | null {
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export interface ForConversationLink {
  teamConversationId: string
  messageId: string
  status: string
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const inboxConversationId = parseInboxConversationId(url.searchParams.get('inboxConversationId'))
  if (!inboxConversationId) {
    return NextResponse.json({ error: 'inboxConversationId is required.' }, { status: 400 })
  }

  const inboxPerm = checkInboxPermission(session, 'inbox_view')
  if (!inboxPerm.allowed) return NextResponse.json({ error: inboxPerm.error }, { status: inboxPerm.status })
  const inboxAccess = await checkConversationAccess(session, String(inboxConversationId))
  if (!inboxAccess.allowed) return NextResponse.json({ error: inboxAccess.error }, { status: inboxAccess.status })

  const candidates = await prisma.teamInboxDiscussionLink.findMany({
    where: { chatwootConversationId: inboxConversationId, status: { not: 'RESOLVED' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { message: { select: { conversationId: true } } },
  })

  for (const candidate of candidates) {
    const membership = await checkConversationMembership(session as AdminSession, candidate.message.conversationId)
    if (membership.allowed) {
      const link: ForConversationLink = {
        teamConversationId: candidate.message.conversationId,
        messageId: candidate.messageId,
        status: candidate.status,
      }
      return NextResponse.json({ link })
    }
  }

  return NextResponse.json({ link: null })
}
