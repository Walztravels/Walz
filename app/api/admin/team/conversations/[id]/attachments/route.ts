import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { currentStaffId, checkConversationMembership } from '@/lib/team/authz'
import {
  isAllowedAttachmentType, sanitizeFilename, buildAttachmentStorageKey,
  uploadAttachment, MAX_ATTACHMENT_BYTES,
} from '@/lib/team/attachments'

export const dynamic = 'force-dynamic'

const MAX_CAPTION_CHARS = 2000

/**
 * POST — upload a file attachment, always carried by a new message (an
 * empty-caption message is allowed here specifically to support
 * attachment-only sends, unlike the plain text-message route). Server
 * validates size and MIME allowlist before ever touching storage; the
 * message + attachment row are created together in one transaction so a
 * successful upload can never end up attachment-less or message-less.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const staffId = currentStaffId(session)
  const rl = rateLimit({ key: `team-attachment-upload:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many uploads — please wait a moment.' }, { status: 429 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const caption = (formData.get('body') as string | null)?.trim().slice(0, MAX_CAPTION_CHARS) ?? ''
  const parentMessageIdRaw = formData.get('parentMessageId') as string | null

  if (!file) return NextResponse.json({ error: 'A file is required.' }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 })
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'File is too large (25MB max).' }, { status: 413 })

  const contentType = file.type || 'application/octet-stream'
  if (!isAllowedAttachmentType(contentType)) {
    return NextResponse.json({ error: 'That file type is not supported.' }, { status: 415 })
  }

  let parentMessageId: string | null = null
  if (parentMessageIdRaw) {
    const parent = await prisma.teamMessage.findFirst({ where: { id: parentMessageIdRaw, conversationId: params.id } })
    if (!parent) return NextResponse.json({ error: 'The message you are replying to could not be found.' }, { status: 400 })
    parentMessageId = parent.id
  }

  const message = await prisma.teamMessage.create({
    data: { conversationId: params.id, authorId: staffId, parentMessageId, body: caption },
  })

  const filename = sanitizeFilename(file.name || 'attachment')
  const storageKey = buildAttachmentStorageKey(params.id, message.id, filename)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await uploadAttachment(storageKey, buffer)
  } catch (e) {
    // Roll back the message so a failed upload never leaves an orphaned empty message.
    await prisma.teamMessage.delete({ where: { id: message.id } }).catch(() => {})
    console.error('[team/attachments] upload failed', e)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  const attachment = await prisma.teamMessageAttachment.create({
    data: {
      messageId: message.id, storageKey, filename,
      contentType, sizeBytes: file.size, uploadedBy: staffId,
    },
  })

  await prisma.teamConversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

  return NextResponse.json({
    message: { id: message.id, body: message.body, parentMessageId: message.parentMessageId, createdAt: message.createdAt },
    attachment: { id: attachment.id, filename: attachment.filename, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes },
  })
}
