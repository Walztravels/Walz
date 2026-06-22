import { NextRequest, NextResponse } from 'next/server'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/group/[param]/status
 *
 * Returns how many members have submitted and the current session status.
 * The [param] is the session ID (not token).
 * Called by the creator's polling page to show progress.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: {
      members: {
        select: { id: true, name: true, submittedAt: true },
      },
    },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const total     = session.members.length
  const submitted = session.members.filter(m => m.submittedAt).length
  const allDone   = submitted === total

  return NextResponse.json({
    sessionId:      session.id,
    sessionName:    session.name,
    sessionStatus:  session.status,
    total,
    submitted,
    allDone,
    members: session.members.map(m => ({
      id:          m.id,
      name:        m.name,
      hasSubmitted: !!m.submittedAt,
    })),
    // Reminder nudge after 48 hours
    reminderDue: new Date(session.createdAt.getTime() + 48 * 60 * 60 * 1000) < new Date() && !allDone,
  })
}
