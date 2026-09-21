import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership, checkCanManageMembership } from '@/lib/team/authz'
import { logTeamActivity } from '@/lib/team/activity'
import { notifyChannelInvite } from '@/lib/team/notify'
import { scheduleInviteEmailCandidates } from '@/lib/team/email-notify'

export const dynamic = 'force-dynamic'

/**
 * GET the member list (any current member may view it — membership-gated,
 * never a public/unauthenticated listing per the security audit's
 * "hidden/private channel discovery" concern). Also backs @mention
 * autocomplete via `?q=` — the candidate pool is ALWAYS this same
 * membership-filtered query, so autocomplete can never surface (or be used
 * to probe) who is in a private channel/DM the requester doesn't already
 * belong to. POST adds a member — requires channel-management
 * authorization (owner decision 5): channel creator/admin, or a Team Hub
 * channel manager/admin. An ordinary member may never add or remove
 * another member.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const q = new URL(req.url).searchParams.get('q')?.trim()

  const members = await prisma.teamConversationMember.findMany({
    where: {
      conversationId: params.id,
      leftAt: null,
      ...(q ? { staff: { name: { contains: q, mode: 'insensitive' } } } : {}),
    },
    include: { staff: { select: { id: true, name: true, roleTitle: true, department: true } } },
    orderBy: { joinedAt: 'asc' },
    ...(q ? { take: 20 } : {}),
  })
  return NextResponse.json({
    members: members.map(m => ({ staffId: m.staffId, role: m.role, name: m.staff.name, roleTitle: m.staff.roleTitle, department: m.staff.department })),
  })
}

interface AddBody { staffId?: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authz = await checkCanManageMembership(session, params.id)
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const body = (await req.json().catch(() => ({}))) as AddBody
  const targetId = typeof body.staffId === 'string' ? body.staffId.trim() : ''
  if (!targetId) return NextResponse.json({ error: 'A staff member is required.' }, { status: 400 })

  const target = await prisma.staff.findUnique({ where: { id: targetId }, select: { id: true, isActive: true } })
  if (!target || !target.isActive) return NextResponse.json({ error: 'That staff member is not available.' }, { status: 400 })

  // "Genuinely new membership" means: not currently an active member.
  // Re-saving the member list, or re-adding someone who is already in the
  // conversation, must not be treated as a fresh invitation (V1.1 email
  // rule) — read the live state BEFORE the upsert collapses the two cases.
  const existingMembership = await prisma.teamConversationMember.findFirst({
    where: { conversationId: params.id, staffId: targetId, leftAt: null },
    select: { id: true },
  })
  const isNewMembership = !existingMembership

  await prisma.teamConversationMember.upsert({
    where: { conversationId_staffId: { conversationId: params.id, staffId: targetId } },
    update: { leftAt: null },
    create: { conversationId: params.id, staffId: targetId, role: 'member' },
  })
  await logTeamActivity(session, 'team_channel_membership_changed', params.id, `added ${targetId}`)

  const conversation = await prisma.teamConversation.findUnique({ where: { id: params.id }, select: { name: true } })
  await notifyChannelInvite(targetId, {
    conversationId: params.id,
    channelName: conversation?.name ?? 'a conversation',
    inviterName: session.name,
  })

  // Team Hub V1.1 — email candidate, ONLY for genuinely new membership.
  // Best-effort: adding the member must never fail because of this.
  if (isNewMembership) {
    try {
      await scheduleInviteEmailCandidates(params.id, [targetId], session.name)
    } catch (e) {
      console.warn('[team-members] invite email scheduling failed (non-fatal):', e)
    }
  }

  return NextResponse.json({ ok: true })
}
