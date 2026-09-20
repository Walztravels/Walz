/**
 * Walz Team Hub V1 — StaffNotification wrappers for discrete Team Hub
 * events. Thin, additive layer over the EXISTING
 * lib/notifications/staff.ts's createStaffNotification() — never
 * reimplements its dedup/idempotency logic, never edits that file.
 *
 * Per product spec, Team Hub deliberately does NOT send a discrete
 * notification for every ordinary top-level channel/group message (that
 * would be noise at scale) — only for: a brand new DM, being @mentioned,
 * a reply to YOUR OWN message in a thread, and being added to a
 * channel/group. Callers (the route handlers) are responsible for calling
 * the right wrapper only at those specific moments.
 *
 * There is no StaffNotificationCategory enum value for Team Hub (adding
 * one would require a schema migration, which is out of scope for this
 * task) — every wrapper here uses the generic 'SYSTEM' category and
 * distinguishes itself via the plain-string `sourceType` column instead,
 * which NotificationBell.tsx's sourceLink() keys off.
 *
 * `sourceId` is always the TeamMessage.id (for a DM/mention/reply — one
 * notification per message) or the TeamConversation.id (for a channel
 * invite — one notification per staff member added to that conversation),
 * so the existing (staffId, sourceId) unique constraint naturally dedupes
 * any retried/duplicate call exactly as the SLA-escalation system already
 * relies on.
 *
 * Every wrapper is try/catch-wrapped — a notification failure must never
 * break the caller's main request, mirroring how lib/team/activity.ts's
 * logTeamActivity() already treats its own writes as best-effort.
 */

import { createStaffNotification } from '@/lib/notifications/staff'
import prisma from '@/lib/db'

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

const PREVIEW_MAX = 140

export interface NewDirectMessageInput {
  conversationId: string
  senderName: string
  preview: string
}

/**
 * A brand new DM conversation was just created — notify the OTHER
 * participant, never the creator. Fired once, at conversation-creation
 * time (see app/api/admin/team/conversations/route.ts's createDm), not
 * per message — so the dedup key is the conversationId itself (a second
 * call for the same DM, e.g. a retried request, can only ever mean the
 * same brand-new conversation).
 */
export async function notifyNewDirectMessage(recipientStaffId: string, input: NewDirectMessageInput): Promise<void> {
  try {
    await createStaffNotification({
      staffId: recipientStaffId,
      category: 'SYSTEM',
      title: `New message from ${input.senderName}`,
      body: truncate(input.preview, PREVIEW_MAX),
      sourceId: input.conversationId,
      sourceType: 'team_dm',
      data: { conversationId: input.conversationId },
    })
  } catch (e) {
    console.warn('[team/notify] notifyNewDirectMessage failed:', e)
  }
}

export interface MentionInput {
  conversationId: string
  messageId: string
  authorName: string
  preview: string
}

/** The staff member was @mentioned in a message. */
export async function notifyMention(mentionedStaffId: string, input: MentionInput): Promise<void> {
  try {
    await createStaffNotification({
      staffId: mentionedStaffId,
      category: 'SYSTEM',
      title: `${input.authorName} mentioned you`,
      body: truncate(input.preview, PREVIEW_MAX),
      sourceId: input.messageId,
      sourceType: 'team_mention',
      data: { conversationId: input.conversationId, messageId: input.messageId },
    })
  } catch (e) {
    console.warn('[team/notify] notifyMention failed:', e)
  }
}

export interface ChannelInviteInput {
  conversationId: string
  channelName: string
  inviterName: string
}

/** The staff member was added to a channel or group conversation. */
export async function notifyChannelInvite(invitedStaffId: string, input: ChannelInviteInput): Promise<void> {
  try {
    await createStaffNotification({
      staffId: invitedStaffId,
      category: 'SYSTEM',
      title: `Added to ${input.channelName}`,
      body: `${input.inviterName} added you to ${input.channelName}.`,
      sourceId: input.conversationId,
      sourceType: 'team_channel_invite',
      data: { conversationId: input.conversationId },
    })
  } catch (e) {
    console.warn('[team/notify] notifyChannelInvite failed:', e)
  }
}

export interface ThreadReplyInput {
  conversationId: string
  messageId: string
  replierName: string
  preview: string
}

/** Someone replied, in a thread, to a message the recipient authored. */
export async function notifyThreadReply(parentAuthorStaffId: string, input: ThreadReplyInput): Promise<void> {
  try {
    await createStaffNotification({
      staffId: parentAuthorStaffId,
      category: 'SYSTEM',
      title: `${input.replierName} replied to your message`,
      body: truncate(input.preview, PREVIEW_MAX),
      sourceId: input.messageId,
      sourceType: 'team_thread_reply',
      data: { conversationId: input.conversationId, messageId: input.messageId },
    })
  } catch (e) {
    console.warn('[team/notify] notifyThreadReply failed:', e)
  }
}

export interface CallStartedInput {
  callRecordId: string
  starterId: string
  starterName: string
  conversationName: string | null
}

/**
 * A GROUP/CHANNEL call was just started — notify current, active members
 * ONLY (never the starter). Deliberately queries live TeamConversationMember
 * itself (leftAt: null) rather than accepting a caller-supplied recipient
 * list, for the same reason notifyThreadReply does: a stale/cached member
 * list could otherwise leak a "call started in #<private-channel-name>"
 * notification — title AND body — to a staff member who has since left or
 * was removed. sourceId is the callRecordId (one notification per call
 * start, not per participant-per-call), so the existing (staffId,
 * sourceId) unique constraint dedupes a retried call the same way every
 * other Team Hub notification already relies on.
 */
export async function notifyCallStarted(conversationId: string, input: CallStartedInput): Promise<void> {
  try {
    const members = await prisma.teamConversationMember.findMany({
      where: { conversationId, leftAt: null, staffId: { not: input.starterId } },
      select: { staffId: true },
    })
    const label = input.conversationName ? `${input.starterName} started a call in ${input.conversationName}` : `${input.starterName} started a call`
    await Promise.all(members.map(m => createStaffNotification({
      staffId: m.staffId,
      category: 'SYSTEM',
      title: label,
      body: 'Tap to join.',
      sourceId: input.callRecordId,
      sourceType: 'team_call_started',
      data: { conversationId },
    })))
  } catch (e) {
    console.warn('[team/notify] notifyCallStarted failed:', e)
  }
}
