import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const session = await prisma.itineraryHiveSession.findUnique({
      where:   { slug: params.slug },
      include: { members: { orderBy: { slotNumber: 'asc' } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const submittedCount = session.members.filter(m => m.isSubmitted).length
    const isComplete     = submittedCount >= session.memberCount
    const analysisReady  = session.status === 'done' && !!session.analysisResult

    return NextResponse.json({
      id:             session.id,
      tripName:       session.tripName,
      destination:    session.destination,
      memberCount:    session.memberCount,
      submittedCount,
      isComplete,
      status:         session.status,
      analysisReady,
      analysisResult: analysisReady ? JSON.parse(session.analysisResult!) : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Failed to load session', details: msg.slice(0, 200) }, { status: 500 })
  }
}
