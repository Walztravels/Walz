import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/group/[param]/submit
 *
 * Saves a member's preferences. The [param] is the member's invite token.
 * Sets submittedAt to now so the status page can track progress.
 *
 * Body: preferences (see GroupPreferences interface in lib/group/types.ts)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { param: string } },
) {
  const { param } = params
  const preferences = await req.json().catch(() => null)

  if (!preferences) {
    return NextResponse.json({ error: 'Preferences body required' }, { status: 400 })
  }

  const member = await prisma.sessionMember.findUnique({
    where:   { inviteToken: param },
    include: { session: true },
  })

  if (!member) return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 })
  if (member.session.status === 'locked') {
    return NextResponse.json({ error: 'Session is locked — voting is complete' }, { status: 409 })
  }

  await prisma.sessionMember.update({
    where: { inviteToken: param },
    data:  {
      preferencesJson: preferences,
      submittedAt:     new Date(),
    },
  })

  // Check if all members have now submitted
  const allMembers  = await prisma.sessionMember.findMany({ where: { sessionId: member.sessionId } })
  const allDone     = allMembers.every(m => m.submittedAt || m.id === member.id)

  return NextResponse.json({
    success:    true,
    sessionId:  member.sessionId,
    allDone,
    message:    allDone ? 'All members submitted! The creator can now trigger synthesis.' : 'Preferences saved.',
  })
}
