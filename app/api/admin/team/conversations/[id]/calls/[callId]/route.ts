import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { updateCallRecordStatus, type TeamCallStatus } from '@/lib/team/calls'

export const dynamic = 'force-dynamic'

const PATCHABLE_STATUSES: ReadonlySet<string> = new Set([
  'ANSWERED', 'DECLINED', 'BUSY', 'MISSED', 'ENDED', 'FAILED',
])

interface PatchBody { status?: string }

/**
 * PATCH — update a call's status. Membership-gated (must still be a member
 * of the parent conversation) AND, critically, scoped to the call record
 * itself: only the caller or one of the callees of THIS SPECIFIC call may
 * update its status. Conversation membership alone is NOT sufficient — an
 * unrelated member of the same conversation must not be able to tamper
 * with someone else's call state (e.g. force another member's active call
 * to ENDED).
 *
 * DM ONLY (security review finding, HIGH, fixed): this route predates
 * GROUP/CHANNEL calling and its "caller or callee of THIS call" model is
 * meaningless there — a group call's `participantIds` is always empty (see
 * lib/team/calls.ts's header), so the check above silently collapsed to
 * "are you the original starter," letting a group call's own starter PATCH
 * status:'ENDED' at any time. That would hide the call from GET .../active
 * for everyone else still actually connected on the live Twilio
 * conference (their audio legs are entirely unaffected — this route never
 * touches Twilio), AND free the DB-level "one active call per conversation"
 * slot mid-call, letting a fresh POST /calls immediately spin up a SECOND,
 * independent conference for the same conversation. GROUP/CHANNEL status
 * transitions go exclusively through join/leave (lib/team/calls.ts's
 * joinGroupCall/leaveGroupCall, driven by .../calls/[callId]/join and
 * .../leave) — there is no "end for everyone" action, by design (see this
 * feature's own product-spec comment in lib/team/calls.ts).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; callId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const conversation = await prisma.teamConversation.findUnique({ where: { id: params.id }, select: { type: true } })
  if (!conversation || conversation.type !== 'DM') {
    return NextResponse.json({ error: 'This call does not support that action.' }, { status: 400 })
  }

  const call = await prisma.teamCallRecord.findFirst({ where: { id: params.callId, conversationId: params.id } })
  if (!call) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })

  const staffId = currentStaffId(session)
  const participantIds = Array.isArray(call.participantIds) ? (call.participantIds as unknown as string[]) : []
  const isPartyToThisCall = call.callerId === staffId || participantIds.includes(staffId)
  if (!isPartyToThisCall) {
    return NextResponse.json({ error: 'You can only update calls you are a party to.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody
  if (!body.status || !PATCHABLE_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Invalid call status.' }, { status: 400 })
  }

  const updated = await updateCallRecordStatus(call.id, body.status as TeamCallStatus)
  if (!updated) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })

  return NextResponse.json({
    call: {
      id: updated.id,
      status: updated.status,
      answeredAt: updated.answeredAt,
      endedAt: updated.endedAt,
      durationSeconds: updated.durationSeconds,
    },
  })
}
