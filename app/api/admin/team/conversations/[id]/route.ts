import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkConversationMembership, checkCanManageMembership } from '@/lib/team/authz'
import { logTeamActivity } from '@/lib/team/activity'

export const dynamic = 'force-dynamic'

/**
 * GET a single conversation (membership-gated — see checkConversationMembership's
 * header comment for why there is NO super_admin/team_hub_admin bypass here).
 * PATCH updates name/description/archived — requires channel-management
 * authorization (owner decision 5), never plain membership.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const conversation = await prisma.teamConversation.findUnique({
    where: { id: params.id },
    include: {
      members: {
        where: { leftAt: null },
        include: { staff: { select: { id: true, name: true, roleTitle: true, department: true } } },
      },
    },
  })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })

  return NextResponse.json({
    conversation: {
      id: conversation.id, type: conversation.type, name: conversation.name,
      description: conversation.description, slug: conversation.slug,
      visibility: conversation.visibility, joinable: conversation.joinable,
      archived: conversation.archived,
      members: conversation.members.map(m => ({
        staffId: m.staffId, role: m.role, name: m.staff.name, roleTitle: m.staff.roleTitle, department: m.staff.department,
      })),
      myMembership: { role: membership.member?.role, lastReadAt: membership.member?.lastReadAt ?? null },
    },
  })
}

interface PatchBody {
  name?: string
  description?: string
  archived?: boolean
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authz = await checkCanManageMembership(session, params.id)
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const body = (await req.json().catch(() => ({}))) as PatchBody
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 120)
  if (typeof body.description === 'string') data.description = body.description.trim().slice(0, 500)
  if (typeof body.archived === 'boolean') data.archived = body.archived

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const updated = await prisma.teamConversation.update({ where: { id: params.id }, data })
  const action = body.archived !== undefined ? (body.archived ? 'team_channel_archived' : 'team_channel_unarchived') : 'team_channel_updated'
  await logTeamActivity(session, action, updated.id)

  return NextResponse.json({ ok: true, conversation: { id: updated.id, name: updated.name, description: updated.description, archived: updated.archived } })
}
