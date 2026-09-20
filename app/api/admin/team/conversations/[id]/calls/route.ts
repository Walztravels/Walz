import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { createCallRecord, startOrJoinGroupCall } from '@/lib/team/calls'
import { notifyCallStarted } from '@/lib/team/notify'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

/**
 * GET — call history for this conversation (cursor pagination, mirroring
 * the messages route's own `before`/`limit` convention). Operational
 * metadata ONLY — id, callerId, calleeIds, status, timestamps, duration.
 * There is deliberately no audio/recording reference anywhere in
 * TeamCallRecord and none is ever surfaced here — Team Hub V1 has no
 * call-recording feature.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE

  let cursorStartedAt: Date | undefined
  if (before) {
    const cursorCall = await prisma.teamCallRecord.findFirst({ where: { id: before, conversationId: params.id }, select: { startedAt: true } })
    if (cursorCall) cursorStartedAt = cursorCall.startedAt
  }

  const calls = await prisma.teamCallRecord.findMany({
    where: {
      conversationId: params.id,
      ...(cursorStartedAt ? { startedAt: { lt: cursorStartedAt } } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    calls: calls.map(c => {
      const participantIds = Array.isArray(c.participantIds) ? (c.participantIds as unknown as string[]) : []
      return {
        id: c.id,
        callerId: c.callerId,
        calleeIds: participantIds.filter(id => id !== c.callerId),
        status: c.status,
        startedAt: c.startedAt,
        answeredAt: c.answeredAt,
        endedAt: c.endedAt,
        durationSeconds: c.durationSeconds,
      }
    }),
    hasMore: calls.length === limit,
  })
}

/**
 * POST — initiate (or, for GROUP/CHANNEL, join-if-already-active) a call.
 * Branches on the conversation's own type:
 *   - DM: unchanged 1:1 flow — exactly two currently-active members, one
 *     new INITIATING call record every time.
 *   - GROUP/CHANNEL: startOrJoinGroupCall (lib/team/calls.ts) — DB-level
 *     partial-unique-index-backed concurrency guarantee means two staff
 *     pressing "Start Call" at the same instant can never create two
 *     active calls; the loser transparently joins the winner's call.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  // Security review finding (HIGH): call initiation had no rate limit —
  // an unbounded path to ring another staff member's device repeatedly.
  const rl = rateLimit({ key: `team-call-initiate:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many call attempts — please wait a moment.' }, { status: 429 })

  const staffId = currentStaffId(session)

  const conversation = await prisma.teamConversation.findUnique({ where: { id: params.id }, select: { type: true, name: true } })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

  if (conversation.type === 'GROUP' || conversation.type === 'CHANNEL') {
    const { callRecordId, created } = await startOrJoinGroupCall(params.id, staffId)
    if (created) {
      // Notify current, active, authorized members only — never former,
      // unauthorized, or inactive staff (notifyCallStarted internally
      // re-scopes to CURRENT membership, mirroring notifyThreadReply's own
      // fix, since a stray call to this function must not become a
      // content/existence leak to someone who has left the conversation).
      await notifyCallStarted(params.id, {
        callRecordId,
        starterId: staffId,
        starterName: session.name,
        conversationName: conversation.name,
      })
    }
    return NextResponse.json({ callRecordId, created, type: conversation.type })
  }

  const activeMembers = await prisma.teamConversationMember.findMany({
    where: { conversationId: params.id, leftAt: null },
    select: { staffId: true },
  })

  if (activeMembers.length !== 2) {
    return NextResponse.json(
      { error: 'Could not determine who to call.' },
      { status: 400 },
    )
  }

  const calleeId = activeMembers.map(m => m.staffId).find(id => id !== staffId)
  if (!calleeId) return NextResponse.json({ error: 'Could not determine who to call.' }, { status: 400 })

  const callRecord = await createCallRecord({ conversationId: params.id, callerId: staffId, calleeIds: [calleeId] })

  return NextResponse.json({ callRecordId: callRecord.id, calleeId, type: 'DM' })
}
