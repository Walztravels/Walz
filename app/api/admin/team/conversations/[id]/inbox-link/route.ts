import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

/**
 * Team Hub ↔ Inbox clarification link (TeamInboxDiscussionLink).
 *
 * RELEASE-BLOCKING RULE: creating (or reading, or transitioning) a link is
 * gated by the LOGICAL AND of two independent, real, unmodified checks —
 * neither is ever inferred from the other, and neither is ever skipped
 * because the other passed:
 *   (a) checkConversationMembership(session, [id]) — the caller is an
 *       active member of THIS Team Hub conversation (lib/team/authz.ts —
 *       no super_admin bypass, by design; see that file's header comment).
 *   (b) checkInboxPermission(session, 'inbox_view') AND
 *       checkConversationAccess(session, inboxConversationId) — the
 *       caller has REAL, current Inbox authorization over the TARGET
 *       Chatwoot conversation (lib/inbox/authz.ts — the Inbox's sole
 *       authorization gate, untouched and uncopied).
 * A staff member who is a Team Hub conversation member but has no Inbox
 * access is denied by (b). A staff member with full Inbox access but who
 * is not a member of this Team Hub conversation is denied by (a). Both
 * must hold.
 */

function parseInboxConversationId(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

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

/**
 * POST { messageId, inboxConversationId } — create the link. One link per
 * TeamMessage (messageId is @unique on the model) — calling this again for
 * the same message returns the existing link rather than erroring, so a
 * retried "Ask Team" submission is idempotent.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // (a) Team Hub membership — real, unmodified, checked first so we never
  // touch Inbox data for a caller who isn't even in this Team Hub thread.
  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const body = (await req.json().catch(() => ({}))) as { messageId?: unknown; inboxConversationId?: unknown }
  const messageId = typeof body.messageId === 'string' ? body.messageId : ''
  const inboxConversationId = parseInboxConversationId(body.inboxConversationId)
  if (!messageId || !inboxConversationId) {
    return NextResponse.json({ error: 'messageId and inboxConversationId are required.' }, { status: 400 })
  }

  // The message must belong to THIS Team Hub conversation — never trust a
  // cross-conversation messageId (mirrors the messages route's own
  // parentMessageId scoping discipline).
  const message = await prisma.teamMessage.findFirst({ where: { id: messageId, conversationId: params.id } })
  if (!message) return NextResponse.json({ error: 'Message not found in this conversation.' }, { status: 404 })

  // (b) Inbox authorization on the TARGET conversation — real, unmodified,
  // independent of (a). Never inferred from Team Hub membership.
  const inboxPerm = checkInboxPermission(session, 'inbox_view')
  if (!inboxPerm.allowed) return NextResponse.json({ error: inboxPerm.error }, { status: inboxPerm.status })
  const inboxAccess = await checkConversationAccess(session, String(inboxConversationId))
  if (!inboxAccess.allowed) return NextResponse.json({ error: inboxAccess.error }, { status: inboxAccess.status })

  const existing = await prisma.teamInboxDiscussionLink.findUnique({ where: { messageId } })
  if (existing) return NextResponse.json({ link: serializeLink(existing) })

  const link = await prisma.teamInboxDiscussionLink.create({
    data: {
      messageId,
      chatwootConversationId: inboxConversationId,
      status: 'OPEN',
      linkedBy: currentStaffId(session),
    },
  })
  return NextResponse.json({ link: serializeLink(link) })
}

/**
 * GET ?inboxConversationId=123 — the current clarification link (most
 * recent by createdAt) for that Inbox conversation, scoped to messages in
 * THIS Team Hub conversation. Used by lib/inbox/action-status.ts's "Team
 * clarification" chip and to prevent duplicate links from the client.
 * Requires the SAME (a) AND (b) gate as POST — reading about a specific
 * Inbox conversation is exactly as sensitive as creating the link.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const url = new URL(req.url)
  const inboxConversationId = parseInboxConversationId(url.searchParams.get('inboxConversationId'))
  if (!inboxConversationId) return NextResponse.json({ error: 'inboxConversationId is required.' }, { status: 400 })

  const inboxPerm = checkInboxPermission(session, 'inbox_view')
  if (!inboxPerm.allowed) return NextResponse.json({ error: inboxPerm.error }, { status: inboxPerm.status })
  const inboxAccess = await checkConversationAccess(session, String(inboxConversationId))
  if (!inboxAccess.allowed) return NextResponse.json({ error: inboxAccess.error }, { status: inboxAccess.status })

  const link = await prisma.teamInboxDiscussionLink.findFirst({
    where: { chatwootConversationId: inboxConversationId, message: { conversationId: params.id } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ link: link ? serializeLink(link) : null })
}

/**
 * PATCH { messageId, status } — explicit status transition. 'RESOLVED' is
 * always an explicit staff action (AskTeamPanel's "Mark resolved" button).
 * An automatic OPEN→ANSWERED transition on a thread reply is wired as a
 * best-effort hook in the messages route's POST handler (see the comment
 * there) — this PATCH remains the authoritative, explicit path for every
 * transition, including a manual correction of that automatic one.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const body = (await req.json().catch(() => ({}))) as { messageId?: unknown; status?: unknown }
  const messageId = typeof body.messageId === 'string' ? body.messageId : ''
  const status = typeof body.status === 'string' ? body.status : ''
  const VALID_STATUSES = ['OPEN', 'ANSWERED', 'RESOLVED']
  if (!messageId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'messageId and a valid status are required.' }, { status: 400 })
  }

  const link = await prisma.teamInboxDiscussionLink.findFirst({ where: { messageId, message: { conversationId: params.id } } })
  if (!link) return NextResponse.json({ error: 'Link not found.' }, { status: 404 })

  // Defense in depth: re-verify Inbox authorization on the link's OWN
  // conversation id (never trusted from the request body) before allowing
  // its status to change.
  const inboxPerm = checkInboxPermission(session, 'inbox_view')
  if (!inboxPerm.allowed) return NextResponse.json({ error: inboxPerm.error }, { status: inboxPerm.status })
  const inboxAccess = await checkConversationAccess(session, String(link.chatwootConversationId))
  if (!inboxAccess.allowed) return NextResponse.json({ error: inboxAccess.error }, { status: inboxAccess.status })

  const updated = await prisma.teamInboxDiscussionLink.update({ where: { messageId }, data: { status } })
  return NextResponse.json({ link: serializeLink(updated) })
}
