import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership } from '@/lib/team/authz'
import { getAttachmentSignedUrl, SIGNED_URL_TTL_S } from '@/lib/team/attachments'

export const dynamic = 'force-dynamic'

/**
 * GET — mint a fresh short-lived signed URL. Five-step flow per the
 * approved security spec: (1) authenticate staff, (2) resolve staff
 * identity from session, (3) re-verify CURRENT conversation membership —
 * never trust that the attachment was once accessible, (4) verify the
 * attachment actually belongs to a message in THIS conversation (dual-
 * scoped lookup, IDOR-safe), (5) issue a short-lived signed URL. Nothing
 * is ever persisted from this response.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; messageId: string; attachmentId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const attachment = await prisma.teamMessageAttachment.findFirst({
    where: { id: params.attachmentId, messageId: params.messageId, message: { conversationId: params.id } },
  })
  if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })

  const signedUrl = await getAttachmentSignedUrl(attachment.storageKey, attachment.filename)
  if (!signedUrl) return NextResponse.json({ error: 'Could not generate a download link. Please try again.' }, { status: 500 })

  return NextResponse.json({
    signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_S * 1000).toISOString(),
    filename: attachment.filename,
    contentType: attachment.contentType,
  })
}
