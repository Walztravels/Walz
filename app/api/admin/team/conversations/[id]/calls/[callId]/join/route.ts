import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { joinGroupCall } from '@/lib/team/calls'

export const dynamic = 'force-dynamic'

/**
 * POST — join an in-progress GROUP/CHANNEL call.
 *
 * RELEASE-CRITICAL: re-checks LIVE conversation membership on every join
 * attempt (checkConversationMembership queries fresh, no caching) —
 * knowing a callId/conversationId is never sufficient. A staff member
 * removed from the conversation after the call started cannot newly join
 * even if they retain a stale callId from before removal: this route 403s
 * them here, AND independently the voice webhook (app/api/team/twilio/
 * voice/route.ts) re-checks the same thing again at the moment Twilio
 * actually tries to connect the audio leg — two independent checks, not
 * one relied on twice.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; callId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const conversation = await prisma.teamConversation.findUnique({ where: { id: params.id }, select: { type: true } })
  if (!conversation || (conversation.type !== 'GROUP' && conversation.type !== 'CHANNEL')) {
    return NextResponse.json({ error: 'This conversation does not support group calling.' }, { status: 400 })
  }

  const call = await prisma.teamCallRecord.findFirst({
    where: { id: params.callId, conversationId: params.id, status: { in: ['STARTED', 'ACTIVE'] } },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'This call has ended or could not be found.' }, { status: 404 })

  await joinGroupCall(call.id, currentStaffId(session))

  return NextResponse.json({ ok: true, callRecordId: call.id })
}
