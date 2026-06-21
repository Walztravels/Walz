import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/group/[param]/result
 *
 * Returns the voted destination, vote tallies (only after all voted),
 * and the generated itinerary (if available).
 *
 * [param] = sessionId
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: {
      members: { select: { id: true, name: true } },
      votes:   { select: { memberId: true, destination: true } },
    },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const allVoted   = session.votes.length === session.members.length
  const voteCounts: Record<string, number> = {}
  if (allVoted) {
    for (const v of session.votes) {
      voteCounts[v.destination] = (voteCounts[v.destination] ?? 0) + 1
    }
  }

  return NextResponse.json({
    sessionId:     session.id,
    sessionName:   session.name,
    status:        session.status,
    destination:   session.destination,
    allVoted,
    voteCounts:    allVoted ? voteCounts : null,
    itineraryJson: session.itineraryJson,
    shortlistJson: session.shortlistJson,
    groupNotes:    session.groupNotes,
  })
}
