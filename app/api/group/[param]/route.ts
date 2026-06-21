import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/group/[param]
 *
 * Looks up a session member by invite token.
 * Returns: session name, member name, whether they've already submitted,
 *          and count of submitted members.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
  const { param } = params

  const member = await prisma.sessionMember.findUnique({
    where:   { inviteToken: param },
    include: {
      session: {
        include: {
          members: { select: { submittedAt: true } },
        },
      },
    },
  })

  if (!member) {
    return NextResponse.json({ error: 'Invite link not found or expired' }, { status: 404 })
  }

  const total     = member.session.members.length
  const submitted = member.session.members.filter(m => m.submittedAt).length

  return NextResponse.json({
    sessionId:      member.sessionId,
    sessionName:    member.session.name,
    sessionStatus:  member.session.status,
    memberId:       member.id,
    memberName:     member.name,
    hasSubmitted:   !!member.submittedAt,
    submittedAt:    member.submittedAt,
    totalMembers:   total,
    submitted,
  })
}
