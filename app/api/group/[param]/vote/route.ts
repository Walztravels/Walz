import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/group/[param]/vote
 *
 * Records a member's vote. Checks if all members have voted;
 * if so, determines the winner and locks the session.
 *
 * [param] = sessionId
 * Body: { memberId: string; destination: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { param: string } },
) {
  const body = await req.json().catch(() => null)
  if (!body?.memberId || !body?.destination) {
    return NextResponse.json({ error: 'memberId and destination required' }, { status: 400 })
  }

  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: { members: true },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.status !== 'voting') {
    return NextResponse.json({ error: 'Session is not in voting phase' }, { status: 409 })
  }

  // Upsert vote (allow changing vote)
  await prisma.sessionVote.upsert({
    where: { sessionId_memberId: { sessionId: params.param, memberId: body.memberId } },
    update: { destination: body.destination },
    create: { sessionId: params.param, memberId: body.memberId, destination: body.destination },
  })

  // Check if all members have voted
  const allVotes = await prisma.sessionVote.findMany({ where: { sessionId: params.param } })
  const allVoted = allVotes.length === session.members.length

  if (allVoted) {
    // Tally votes
    const tally: Record<string, number> = {}
    for (const v of allVotes) {
      tally[v.destination] = (tally[v.destination] ?? 0) + 1
    }
    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]

    await prisma.groupSession.update({
      where: { id: params.param },
      data:  { destination: winner, status: 'locked' },
    })

    return NextResponse.json({ success: true, allVoted: true, winner })
  }

  return NextResponse.json({ success: true, allVoted: false })
}
