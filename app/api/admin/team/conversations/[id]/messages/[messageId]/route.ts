import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership, canEditMessage, canDeleteMessage, currentStaffId } from '@/lib/team/authz'
import { logTeamActivity } from '@/lib/team/activity'

export const dynamic = 'force-dynamic'

const MAX_BODY_CHARS = 8000

interface PatchBody { body?: string }

/**
 * PATCH — edit own message only (owner decision 6). Preserves createdAt,
 * stamps editedAt, never alters authorId. There is no admin-edit path —
 * only the author may ever change message text (see canEditMessage's
 * header comment in lib/team/authz.ts).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const message = await prisma.teamMessage.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message || message.deletedAt) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  if (!canEditMessage(session, message.authorId)) return NextResponse.json({ error: 'You can only edit your own messages.' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as PatchBody
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 })
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 })

  const updated = await prisma.teamMessage.update({
    where: { id: message.id },
    data: { body: text, editedAt: new Date() },
  })

  return NextResponse.json({ message: { id: updated.id, body: updated.body, editedAt: updated.editedAt } })
}

/**
 * DELETE — soft delete only (owner decision 7): tombstone via deletedAt,
 * never a hard row delete (preserves thread reply counts / pagination
 * cursors / mention history). Author may always delete their own message;
 * a Team Hub administrator may delete someone else's as moderation, and
 * that path is always audit-logged (never a silent admin action, and
 * never available as an edit — only delete).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const message = await prisma.teamMessage.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message || message.deletedAt) return NextResponse.json({ ok: true }) // idempotent

  const deleteAs = canDeleteMessage(session, message.authorId)
  if (!deleteAs) return NextResponse.json({ error: 'You do not have permission to delete this message.' }, { status: 403 })

  await prisma.teamMessage.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), deletedBy: currentStaffId(session) },
  })

  if (deleteAs === 'admin') {
    await logTeamActivity(session, 'team_admin_setting_changed', params.id, `admin-deleted message ${message.id} authored by ${message.authorId}`, 'team_message')
  }

  return NextResponse.json({ ok: true })
}
