import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const hiveSession = await prisma.groupHiveSession.findUnique({
    where: { slug: params.slug },
    include: { members: { select: { isSubmitted: true, slotNumber: true } } },
  })

  if (!hiveSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const submittedCount = hiveSession.members.filter(m => m.isSubmitted).length
  const isComplete     = submittedCount >= hiveSession.memberCount

  return NextResponse.json({
    groupName:     hiveSession.groupName,
    visaType:      hiveSession.visaType,
    destination:   hiveSession.destination,
    travelDate:    hiveSession.travelDate,
    memberCount:   hiveSession.memberCount,
    submittedCount,
    isComplete,
    status:        hiveSession.status,
  })
}
