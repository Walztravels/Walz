import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership, currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

const MAX_EMOJI_CHARS = 8 // generous for a single emoji grapheme incl. skin-tone/ZWJ sequences

interface ReactBody { emoji?: string }

/** POST — toggle a reaction. Adding a reaction the caller already placed with the same emoji removes it (idempotent toggle), matching standard chat-app behavior. */
export async function POST(req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const message = await prisma.teamMessage.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message || message.deletedAt) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as ReactBody
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : ''
  if (!emoji || emoji.length > MAX_EMOJI_CHARS) return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 })

  const staffId = currentStaffId(session)
  const existing = await prisma.teamMessageReaction.findUnique({
    where: { messageId_staffId_emoji: { messageId: message.id, staffId, emoji } },
  })

  if (existing) {
    await prisma.teamMessageReaction.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, action: 'removed' })
  }

  await prisma.teamMessageReaction.create({ data: { messageId: message.id, staffId, emoji } })
  return NextResponse.json({ ok: true, action: 'added' })
}
