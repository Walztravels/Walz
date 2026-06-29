import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
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
    if (session.status !== 'collecting') {
      return NextResponse.json({ error: 'This hive is no longer accepting submissions' }, { status: 400 })
    }

    const slot = session.members.find(m => !m.isSubmitted)
    if (!slot) {
      return NextResponse.json({ error: 'All slots are filled' }, { status: 400 })
    }

    const body = await req.json() as {
      name:         string
      destinations?: string
      travelStyle?:  string
      budget?:       string
      mustHaves?:    string
      dates?:        string
      specialNeeds?: string
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
    }

    await prisma.itineraryHiveMember.update({
      where: { id: slot.id },
      data:  {
        name:         body.name.trim(),
        destinations: body.destinations ?? null,
        travelStyle:  body.travelStyle  ?? null,
        budget:       body.budget       ?? null,
        mustHaves:    body.mustHaves    ?? null,
        dates:        body.dates        ?? null,
        specialNeeds: body.specialNeeds ?? null,
        isSubmitted:  true,
        submittedAt:  new Date(),
      },
    })

    const newSubmittedCount = session.members.filter(m => m.isSubmitted).length + 1
    const isComplete        = newSubmittedCount >= session.memberCount

    if (isComplete) {
      await prisma.itineraryHiveSession.update({
        where: { id: session.id },
        data:  { status: 'complete' },
      })
    }

    return NextResponse.json({
      success:        true,
      slotNumber:     slot.slotNumber,
      submittedCount: newSubmittedCount,
      totalCount:     session.memberCount,
      isComplete,
      message: isComplete
        ? 'All travellers have submitted! Ready for Jade to find your perfect destination.'
        : `Got it! Waiting for ${session.memberCount - newSubmittedCount} more traveller${session.memberCount - newSubmittedCount === 1 ? '' : 's'}.`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[plan/group-hive submit]', msg)
    return NextResponse.json({ error: 'Submission failed', details: msg.slice(0, 200) }, { status: 500 })
  }
}
