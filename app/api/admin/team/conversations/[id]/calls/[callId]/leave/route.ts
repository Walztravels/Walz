import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import { leaveGroupCall } from '@/lib/team/calls'

export const dynamic = 'force-dynamic'

/**
 * POST — end the caller's OWN participation in a GROUP/CHANNEL call (per
 * product spec: participants end their own participation; there is no
 * separate "host ends call for everyone" action). Idempotent — leaving
 * twice, or a call you were never on, both succeed as a no-op. When this
 * was the last remaining active participant, lib/team/calls.ts's
 * leaveGroupCall transitions the call to ENDED — "the call ends cleanly."
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; callId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const call = await prisma.teamCallRecord.findFirst({ where: { id: params.callId, conversationId: params.id }, select: { id: true } })
  if (!call) return NextResponse.json({ ok: true }) // already gone — idempotent

  await leaveGroupCall(call.id, currentStaffId(session))

  return NextResponse.json({ ok: true })
}
