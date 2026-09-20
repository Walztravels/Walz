import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership, currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

interface ReadBody { messageId?: string }

/**
 * POST — bump this member's read cursor. Never a per-message row (see
 * TeamConversationMember's header comment) — one UPDATE per call, on the
 * caller's own membership row only (never trusts a staffId from the body).
 * Accepts messageId "going backwards" as a no-op success rather than an
 * error, since a stale/duplicate client-side bump (multi-tab, race with a
 * new incoming message) is expected, not exceptional.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const body = (await req.json().catch(() => ({}))) as ReadBody
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
  if (!messageId) return NextResponse.json({ error: 'A messageId is required.' }, { status: 400 })

  const message = await prisma.teamMessage.findFirst({ where: { id: messageId, conversationId: params.id }, select: { createdAt: true } })
  if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })

  const current = membership.member!
  if (current.lastReadAt && current.lastReadAt >= message.createdAt) {
    return NextResponse.json({ ok: true }) // already at or past this point — no-op
  }

  await prisma.teamConversationMember.update({
    where: { conversationId_staffId: { conversationId: params.id, staffId: currentStaffId(session) } },
    data: { lastReadMessageId: messageId, lastReadAt: message.createdAt },
  })

  return NextResponse.json({ ok: true })
}
