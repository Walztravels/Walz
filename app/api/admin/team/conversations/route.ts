import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { currentStaffId } from '@/lib/team/authz'
import { createOrGetDm, createGroup, createChannel, listConversationsForStaff } from '@/lib/team/conversations'
import { logTeamActivity } from '@/lib/team/activity'
import { notifyNewDirectMessage, notifyChannelInvite } from '@/lib/team/notify'
import { scheduleInviteEmailCandidates } from '@/lib/team/email-notify'

export const dynamic = 'force-dynamic'

/**
 * Walz Team Hub — conversation list (GET) and creation (POST: DM/GROUP/
 * CHANNEL). Baseline access derives from an active Staff session alone —
 * there is no team_hub_access permission (see lib/team/authz.ts's header
 * comment). Creating a PRIVATE channel or a channel at all beyond the
 * default #general (see the bootstrap script) requires no special
 * permission for GROUP/PUBLIC-channel creation — any active staff member
 * may create a group DM or a public channel, matching "staff should be
 * able to create group conversations" / "channel creation if authorized"
 * read together with owner decision 5's silence on channel-CREATION
 * itself (only membership-management is restricted). PRIVATE channel
 * creation is likewise open to any active staff member — restricting who
 * may join/be added is what owner decision 5 actually gates, not who may
 * start one.
 */

const MAX_GROUP_NAME = 120
const MAX_GROUP_MEMBERS = 50

interface CreateBody {
  type?: 'DM' | 'GROUP' | 'CHANNEL'
  staffId?: string                 // DM target
  name?: string                    // GROUP/CHANNEL
  memberStaffIds?: string[]        // GROUP
  description?: string             // CHANNEL
  visibility?: 'PUBLIC' | 'PRIVATE' // CHANNEL
  joinable?: boolean               // CHANNEL, PUBLIC only
  initialMemberStaffIds?: string[] // CHANNEL, PRIVATE
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { joined, discoverablePublic } = await listConversationsForStaff(currentStaffId(session))
  return NextResponse.json({ joined, discoverablePublic })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit({ key: `team-conversation-create:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests — please wait a moment.' }, { status: 429 })

  const body = (await req.json().catch(() => ({}))) as CreateBody
  const staffId = currentStaffId(session)

  if (body.type === 'DM') {
    return createDm(body, staffId, session)
  }
  if (body.type === 'GROUP') {
    return createGroupConversation(body, staffId, session)
  }
  if (body.type === 'CHANNEL') {
    return createChannelConversation(body, staffId, session)
  }
  return NextResponse.json({ error: 'Unknown conversation type.' }, { status: 400 })
}

async function createDm(body: CreateBody, staffId: string, session: AdminSession) {
  const targetId = typeof body.staffId === 'string' ? body.staffId.trim() : ''
  if (!targetId) return NextResponse.json({ error: 'A staff member is required.' }, { status: 400 })

  const target = await prisma.staff.findUnique({ where: { id: targetId }, select: { id: true, isActive: true } })
  if (!target || !target.isActive) {
    return NextResponse.json({ error: 'That staff member is not available.' }, { status: 400 })
  }
  if (targetId === staffId) {
    return NextResponse.json({ error: 'You cannot start a DM with yourself.' }, { status: 400 })
  }

  const result = await createOrGetDm(staffId, targetId, staffId)

  // Only notify on a genuinely NEW DM, and only the OTHER participant —
  // never the creator, and never for a re-fetch of a pre-existing DM.
  if (result.created) {
    await notifyNewDirectMessage(targetId, {
      conversationId: result.conversationId,
      senderName: session.name,
      preview: 'Started a new conversation with you.',
    })
  }

  return NextResponse.json({ conversationId: result.conversationId, created: result.created })
}

async function createGroupConversation(body: CreateBody, staffId: string, session: AdminSession) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const memberStaffIds = Array.isArray(body.memberStaffIds) ? body.memberStaffIds.filter(id => typeof id === 'string') : []
  if (!name) return NextResponse.json({ error: 'A group name is required.' }, { status: 400 })
  if (name.length > MAX_GROUP_NAME) return NextResponse.json({ error: 'Group name is too long.' }, { status: 400 })
  if (memberStaffIds.length === 0) return NextResponse.json({ error: 'Add at least one other staff member.' }, { status: 400 })
  if (memberStaffIds.length > MAX_GROUP_MEMBERS) return NextResponse.json({ error: 'Too many members for one group.' }, { status: 400 })

  const activeMembers = await prisma.staff.findMany({
    where: { id: { in: memberStaffIds }, isActive: true },
    select: { id: true },
  })
  if (activeMembers.length !== memberStaffIds.length) {
    return NextResponse.json({ error: 'One or more selected staff members are not available.' }, { status: 400 })
  }

  const conversationId = await createGroup({ name, memberStaffIds: activeMembers.map(s => s.id), createdBy: staffId })
  await logTeamActivity(session, 'team_group_created', conversationId, `name=${name} members=${activeMembers.length + 1}`)

  // Notify every OTHER member added at creation time (never the creator).
  const invitedMemberIds = activeMembers.map(m => m.id).filter(id => id !== staffId)
  await Promise.all(
    invitedMemberIds
      .map(id => notifyChannelInvite(id, { conversationId, channelName: name, inviterName: session.name })),
  )

  // Team Hub V1.1 — email candidates for the SAME genuinely-new members
  // (a brand-new group's members were, by definition, not in it before).
  // Best-effort: creating the group must never fail because of this.
  try {
    await scheduleInviteEmailCandidates(conversationId, invitedMemberIds, session.name)
  } catch (e) {
    console.warn('[team-conversations] group invite email scheduling failed (non-fatal):', e)
  }

  return NextResponse.json({ conversationId })
}


async function createChannelConversation(body: CreateBody, staffId: string, session: AdminSession) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const visibility = body.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
  if (!name) return NextResponse.json({ error: 'A channel name is required.' }, { status: 400 })
  if (name.length > MAX_GROUP_NAME) return NextResponse.json({ error: 'Channel name is too long.' }, { status: 400 })

  let initialMemberStaffIds: string[] = []
  if (visibility === 'PRIVATE' && Array.isArray(body.initialMemberStaffIds)) {
    const candidates = body.initialMemberStaffIds.filter(id => typeof id === 'string')
    const activeMembers = await prisma.staff.findMany({ where: { id: { in: candidates }, isActive: true }, select: { id: true } })
    initialMemberStaffIds = activeMembers.map(s => s.id)
  }

  const conversationId = await createChannel({
    name,
    description: typeof body.description === 'string' ? body.description : undefined,
    visibility,
    joinable: body.joinable !== false,
    createdBy: staffId,
    initialMemberStaffIds,
  })

  // Structural note: channel CREATION is open to any active staff member
  // (see file header) — checkTeamHubAdminAction (lib/team/authz.ts) is
  // reserved for archiving/managing membership of a channel someone else
  // created, not for gating creation itself.
  await logTeamActivity(session, 'team_channel_created', conversationId, `name=${name} visibility=${visibility}`)

  // Notify every OTHER initial member added at creation time (PRIVATE
  // channels only — PUBLIC channels have no initialMemberStaffIds, since
  // they're self-joinable per owner decision 5).
  const invitedMemberIds = initialMemberStaffIds.filter(id => id !== staffId)
  await Promise.all(
    invitedMemberIds
      .map(id => notifyChannelInvite(id, { conversationId, channelName: name, inviterName: session.name })),
  )

  // Team Hub V1.1 — email candidates for the same brand-new PRIVATE-channel
  // members. PUBLIC channels have no initialMemberStaffIds (they are
  // self-joinable), so joining one never emails anybody. Best-effort.
  try {
    await scheduleInviteEmailCandidates(conversationId, invitedMemberIds, session.name)
  } catch (e) {
    console.warn('[team-conversations] channel invite email scheduling failed (non-fatal):', e)
  }

  return NextResponse.json({ conversationId })
}
