import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/group/[param]/submit
 *
 * Saves a member's preferences. The [param] is the member's invite token.
 * Sets submittedAt. When the last member submits, tallies destination votes,
 * picks a winner, and locks the session.
 *
 * Body: { name?, destinations, budget, vibe, durationDays }
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
  // Only block if AI has already picked a destination and itinerary is being generated
  if (member.session.status === 'locked' && member.session.destination) {
    return NextResponse.json({ error: 'Itinerary is already being generated' }, { status: 409 })
  }

  // Update member name if provided
  const memberName = typeof preferences.name === 'string' ? preferences.name.trim() : ''

  await prisma.sessionMember.update({
    where: { inviteToken: param },
    data:  {
      ...(memberName ? { name: memberName } : {}),
      preferencesJson: preferences,
      submittedAt:     new Date(),
    },
  })

  // Fetch all members fresh after save so we have their updated prefs
  const allMembers = await prisma.sessionMember.findMany({ where: { sessionId: member.sessionId } })
  const allDone    = allMembers.every(m => m.submittedAt)

  if (allDone) {
    // Tally destination votes: 1st choice = 3 pts, 2nd = 2 pts, 3rd = 1 pt
    const votes: Record<string, number> = {}
    for (const m of allMembers) {
      const prefs = m.preferencesJson as { destinations?: string[] } | null
      const dests = prefs?.destinations ?? []
      dests.forEach((d, i) => {
        if (d && i < 3) votes[d] = (votes[d] ?? 0) + (3 - i)
      })
    }

    const winner = Object.entries(votes).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

    await prisma.groupSession.update({
      where: { id: member.sessionId },
      data:  {
        status:      'locked',
        ...(winner ? { destination: winner } : {}),
      },
    })
  }

  return NextResponse.json({
    success:   true,
    sessionId: member.sessionId,
    allDone,
    message:   allDone ? 'All members submitted! Generating your itinerary…' : 'Preferences saved.',
  })
}
