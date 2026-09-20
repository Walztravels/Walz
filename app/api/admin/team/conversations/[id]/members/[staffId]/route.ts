import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { checkCanManageMembership } from '@/lib/team/authz'
import { logTeamActivity } from '@/lib/team/activity'

export const dynamic = 'force-dynamic'

/** Remove a member — soft-remove (leftAt), never a hard delete of the membership row or their message history. Requires channel-management authorization. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; staffId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authz = await checkCanManageMembership(session, params.id)
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const member = await prisma.teamConversationMember.findFirst({
    where: { conversationId: params.id, staffId: params.staffId, leftAt: null },
  })
  if (!member) return NextResponse.json({ ok: true }) // idempotent — already removed

  await prisma.teamConversationMember.update({ where: { id: member.id }, data: { leftAt: new Date() } })
  await logTeamActivity(session, 'team_channel_membership_changed', params.id, `removed ${params.staffId}`)

  return NextResponse.json({ ok: true })
}
