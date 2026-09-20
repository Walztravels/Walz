/**
 * Walz Team Hub V1 — Jade grounding layer for TEAM HUB conversations.
 *
 * This module is the ONLY place Team Hub conversation content is read for
 * Jade/AI purposes — no other file may query `teamMessage` rows to feed an
 * AI prompt. Centralizing this here means the membership gate and the
 * prompt-injection fencing are applied exactly once, consistently, rather
 * than re-implemented (and potentially forgotten) at each call site.
 *
 * Authorization is unconditional: `checkConversationMembership` (see
 * lib/team/authz.ts's header comment) has ZERO role-based bypass, including
 * for super_admin. This module calls it FIRST and returns immediately on
 * denial — it never queries a single message row before membership is
 * confirmed.
 *
 * Deleted-message handling: a tombstoned message's body is represented here
 * as the literal string "[deleted]", never the original text — a
 * moderation or self-delete must be honored for AI consumption exactly as
 * it is for human consumption in the messages route
 * (app/api/admin/team/conversations/[id]/messages/route.ts renders
 * body:null client-side for the same rows). Deleted messages are still
 * INCLUDED in the sequence (not silently dropped) so summaries/thread
 * context don't misrepresent the conversation's shape.
 *
 * Prompt-injection fencing: every message body is run through the shared
 * lib/jade/assist/context-fence.ts's `buildFencedTranscript` before it is
 * ever concatenated into a model prompt — untrusted staff-authored content
 * must never be treated as instructions to the model. That module's
 * `ConversationTurn` type only distinguishes 'client' vs 'agent' (it was
 * built for client-facing Inbox conversations); Team Hub has no client —
 * every participant is internal staff — so every turn here is tagged
 * 'agent' and the author's name is folded directly into the turn's text so
 * the model can still tell speakers apart. The module's header/footer
 * wording (which mentions "the client") is inherited verbatim since
 * context-fence.ts is reused AS-IS, unmodified, per the release brief —
 * a harmless framing mismatch, not a functional one: the fencing /
 * marker-stripping / size-clamping behavior it exists for applies
 * identically to any untrusted transcript text, staff-authored or not.
 */

import type { AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership } from '@/lib/team/authz'
import { buildFencedTranscript, type ConversationTurn } from '@/lib/jade/assist/context-fence'

export const DEFAULT_GROUNDING_LIMIT = 50
export const MAX_GROUNDING_LIMIT = 200

export interface TeamHubGroundingMessage {
  id: string
  authorId: string
  authorName: string
  /** "[deleted]" for a tombstoned message — never the raw underlying body. */
  body: string
  deleted: boolean
  parentMessageId: string | null
  createdAt: Date
}

export interface TeamHubGrounding {
  conversationId: string
  conversationType: string
  conversationName: string | null
  messages: TeamHubGroundingMessage[]
  participantNames: string[]
  /** Pre-fenced, size-clamped transcript block (context-fence.ts) ready to drop into a model prompt. */
  fencedTranscript: string
}

export type BuildTeamHubGroundingResult =
  | { ok: true; grounding: TeamHubGrounding }
  | { ok: false; status: 403 | 404; error: string }

export interface BuildTeamHubGroundingOptions {
  /** When set, grounds on this specific thread (the parent message + its replies) instead of the top-level feed. */
  parentMessageId?: string
  /** Max messages to fetch. Default DEFAULT_GROUNDING_LIMIT, hard-capped at MAX_GROUNDING_LIMIT regardless of what's requested. */
  limit?: number
}

interface RawTeamMessage {
  id: string
  authorId: string
  author: { name: string }
  body: string
  deletedAt: Date | null
  parentMessageId: string | null
  createdAt: Date
}

/**
 * Builds read-only Jade grounding for one Team Hub conversation (or one
 * thread within it). Denies immediately — never touching a message row —
 * when the caller is not an active member of the conversation.
 */
export async function buildTeamHubGrounding(
  session: AdminSession,
  conversationId: string,
  opts: BuildTeamHubGroundingOptions = {},
): Promise<BuildTeamHubGroundingResult> {
  const membership = await checkConversationMembership(session, conversationId)
  if (!membership.allowed) {
    return { ok: false, status: membership.status === 404 ? 404 : 403, error: membership.error }
  }

  const limit = Number.isFinite(opts.limit) && (opts.limit as number) > 0
    ? Math.min(opts.limit as number, MAX_GROUNDING_LIMIT)
    : DEFAULT_GROUNDING_LIMIT

  const conversation = await prisma.teamConversation.findUnique({
    where: { id: conversationId },
    select: { type: true, name: true },
  })
  if (!conversation) return { ok: false, status: 404, error: 'Conversation not found.' }

  const [rawMessages, members] = await Promise.all([
    fetchMessages(conversationId, opts.parentMessageId, limit),
    prisma.teamConversationMember.findMany({
      where: { conversationId, leftAt: null },
      include: { staff: { select: { name: true } } },
    }),
  ])

  const messages: TeamHubGroundingMessage[] = rawMessages.map((m: RawTeamMessage) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: m.author.name,
    body: m.deletedAt ? '[deleted]' : m.body,
    deleted: m.deletedAt !== null,
    parentMessageId: m.parentMessageId,
    createdAt: m.createdAt,
  }))

  const participantNames = Array.from(
    new Set(members.map((mm: { staff: { name: string } }) => mm.staff.name).filter(Boolean)),
  )

  const turns: ConversationTurn[] = messages.map(m => ({
    role: 'agent',
    text: `${m.authorName}: ${m.body}`,
  }))
  const fencedTranscript = buildFencedTranscript(turns, { maxTurns: limit, maxCharsPerTurn: 800, maxBlockChars: 12000 })

  return {
    ok: true,
    grounding: {
      conversationId,
      conversationType: conversation.type,
      conversationName: conversation.name,
      messages,
      participantNames,
      fencedTranscript,
    },
  }
}

/**
 * Thread mode (`parentMessageId` given) fetches that specific message plus
 * its replies (oldest-first) — the same "thread" shape the messages route's
 * GET ?parentMessageId= exposes. Feed mode (no `parentMessageId`) fetches
 * the most recent `limit` TOP-LEVEL messages, oldest-first, mirroring the
 * messages route's own GET pagination query exactly (parentMessageId: null,
 * orderBy createdAt desc, then reversed for chronological order).
 */
async function fetchMessages(
  conversationId: string,
  parentMessageId: string | undefined,
  limit: number,
): Promise<RawTeamMessage[]> {
  const include = { author: { select: { id: true, name: true } } } as const

  if (parentMessageId) {
    const [parent, replies] = await Promise.all([
      prisma.teamMessage.findFirst({ where: { id: parentMessageId, conversationId }, include }),
      prisma.teamMessage.findMany({
        where: { conversationId, parentMessageId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include,
      }),
    ])
    return parent ? [parent, ...replies] : replies
  }

  const messages: RawTeamMessage[] = await prisma.teamMessage.findMany({
    where: { conversationId, parentMessageId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include,
  })
  return messages.reverse()
}
