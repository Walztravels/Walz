import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { notifyMention, notifyThreadReply } from '@/lib/team/notify'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const MAX_BODY_CHARS = 8000

/**
 * GET — cursor-based pagination (never loads full history). `before` is a
 * message id; the page returned is the `limit` messages immediately
 * preceding it (or the newest `limit` messages if `before` is omitted).
 * Tombstoned (deletedAt != null) messages ARE included — the client
 * renders them as "Message deleted", never hides them from the sequence
 * (hiding them would break pagination cursors and thread reply counts).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const parentMessageId = url.searchParams.get('parentMessageId') // set to view a single thread
  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE

  let cursorCreatedAt: Date | undefined
  if (before) {
    const cursorMessage = await prisma.teamMessage.findFirst({ where: { id: before, conversationId: params.id }, select: { createdAt: true } })
    if (cursorMessage) cursorCreatedAt = cursorMessage.createdAt
  }

  const messages = await prisma.teamMessage.findMany({
    where: {
      conversationId: params.id,
      parentMessageId: parentMessageId ?? null, // null = top-level feed; a specific id = that thread's replies
      ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: { select: { id: true, name: true } },
      reactions: { select: { staffId: true, emoji: true } },
      attachments: { select: { id: true, filename: true, contentType: true, sizeBytes: true } },
      mentions: { select: { mentionedStaffId: true } },
      _count: { select: { replies: true } },
    },
  })

  return NextResponse.json({
    messages: messages.reverse().map(m => ({
      id: m.id,
      authorId: m.authorId,
      authorName: m.author.name,
      body: m.deletedAt ? null : m.body,
      deleted: m.deletedAt !== null,
      editedAt: m.editedAt,
      parentMessageId: m.parentMessageId,
      replyCount: m._count.replies,
      reactions: m.reactions,
      attachments: m.attachments,
      mentionedStaffIds: m.mentions.map(x => x.mentionedStaffId),
      createdAt: m.createdAt,
    })),
    hasMore: messages.length === limit,
  })
}

interface SendBody {
  body?: string
  parentMessageId?: string
  mentionedStaffIds?: string[]
}

/** POST — send a message. Author identity is ALWAYS server-resolved from the session, never trusted from the request body. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const staffId = currentStaffId(session)
  const rl = rateLimit({ key: `team-message-send:${session.email}`, limit: 120, windowMs: 5 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'You are sending messages too quickly — please slow down.' }, { status: 429 })

  const body = (await req.json().catch(() => ({}))) as SendBody
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 })
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 })

  // A thread reply's parent must belong to THIS SAME conversation — never
  // trust a cross-conversation parentMessageId (would otherwise let one
  // conversation's reply silently attach to another's thread).
  let parentMessageId: string | null = null
  let parentAuthorId: string | null = null
  if (typeof body.parentMessageId === 'string' && body.parentMessageId) {
    const parent = await prisma.teamMessage.findFirst({ where: { id: body.parentMessageId, conversationId: params.id } })
    if (!parent) return NextResponse.json({ error: 'The message you are replying to could not be found.' }, { status: 400 })
    parentMessageId = parent.id
    parentAuthorId = parent.authorId
  }

  // Mentions are validated against CURRENT membership of this same
  // conversation — never resolved from raw text, and silently dropped
  // (not erroring the whole send) if a candidate isn't actually a member,
  // so mention autocomplete can never be used to probe who's in a
  // conversation the requester can already see, nor to leak a mention
  // into a conversation the mentioned staff member isn't part of.
  const candidateMentionIds = Array.isArray(body.mentionedStaffIds) ? Array.from(new Set(body.mentionedStaffIds.filter(id => typeof id === 'string'))) : []
  // Both the mention list AND the thread-reply notify target (below) must
  // be checked against CURRENT membership — a message's historical
  // authorId/mention row proves nothing about whether that staff member
  // still has access today. Security review finding (CRITICAL): the
  // thread-reply notify path previously skipped this check, leaking a
  // preview of new conversation content to a staff member who had already
  // left the conversation.
  const notifiableCandidateIds = Array.from(new Set([...candidateMentionIds, ...(parentAuthorId ? [parentAuthorId] : [])]))
  const currentMemberIds = notifiableCandidateIds.length > 0
    ? new Set((await prisma.teamConversationMember.findMany({
        where: { conversationId: params.id, staffId: { in: notifiableCandidateIds }, leftAt: null },
        select: { staffId: true },
      })).map(m => m.staffId))
    : new Set<string>()
  const validMentionIds = candidateMentionIds.filter(id => currentMemberIds.has(id))

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.teamMessage.create({
      data: { conversationId: params.id, authorId: staffId, parentMessageId, body: text },
    })
    if (validMentionIds.length > 0) {
      await tx.teamMention.createMany({
        data: validMentionIds.map(mentionedStaffId => ({ messageId: created.id, mentionedStaffId })),
      })
    }
    await tx.teamConversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })
    return created
  })

  // Discrete notifications only — never a per-message blast to every
  // member of a channel/group (see lib/team/notify.ts's header). A staff
  // member who mentions themselves is silently excluded, not notified.
  const preview = text.length > 140 ? `${text.slice(0, 139)}…` : text
  await Promise.all(
    validMentionIds
      .filter(id => id !== staffId)
      .map(id => notifyMention(id, { conversationId: params.id, messageId: message.id, authorName: session.name, preview })),
  )
  if (parentAuthorId && parentAuthorId !== staffId && currentMemberIds.has(parentAuthorId)) {
    await notifyThreadReply(parentAuthorId, { conversationId: params.id, messageId: message.id, replierName: session.name, preview })
  }

  // Ask Team / Inbox clarification — best-effort OPEN→ANSWERED transition:
  // a reply landing on the linked message's own thread means the team has
  // responded. Deliberately narrow (only the EXACT linked message's
  // thread, only OPEN→ANSWERED, never ANSWERED/RESOLVED) and never blocks
  // or fails the send if it errors. See .../inbox-link/route.ts's PATCH
  // for the authoritative, explicit transition path (RESOLVED is always a
  // deliberate staff action, never automatic).
  if (parentMessageId) {
    // Optional chaining guards a mock/test double that predates this model
    // (see __tests__/team-messages-route.test.ts) — real Prisma always has it.
    prisma.teamInboxDiscussionLink
      ?.updateMany({ where: { messageId: parentMessageId, status: 'OPEN' }, data: { status: 'ANSWERED' } })
      ?.catch((e: unknown) => console.warn('[team-messages] auto ANSWERED transition failed (non-fatal):', e))
  }

  return NextResponse.json({
    message: {
      id: message.id, authorId: message.authorId, body: message.body,
      parentMessageId: message.parentMessageId, createdAt: message.createdAt,
      mentionedStaffIds: validMentionIds,
    },
  })
}
