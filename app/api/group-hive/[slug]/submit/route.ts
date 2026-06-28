import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const hiveSession = await prisma.groupHiveSession.findUnique({
    where: { slug: params.slug },
    include: { members: { orderBy: { slotNumber: 'asc' } } },
  })

  if (!hiveSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (hiveSession.status !== 'collecting') {
    return NextResponse.json({ error: 'This session is no longer accepting submissions' }, { status: 400 })
  }

  const slot = hiveSession.members.find(m => !m.isSubmitted)
  if (!slot) return NextResponse.json({ error: 'All slots are filled. Contact Walz Travels if you think this is an error.' }, { status: 400 })

  const body = await req.json() as {
    firstName:        string
    lastName:         string
    dateOfBirth?:     string
    nationality?:     string
    passportNumber?:  string
    passportExpiry?:  string
    email?:           string
    phone?:           string
    hasUKVisa?:       boolean
    previousRefusals?: boolean
    travelHistory?:   string
  }

  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 })
  }

  await prisma.groupHiveMember.update({
    where: { id: slot.id },
    data: {
      firstName:        body.firstName.trim(),
      lastName:         body.lastName.trim(),
      dateOfBirth:      body.dateOfBirth,
      nationality:      body.nationality,
      passportNumber:   body.passportNumber,
      passportExpiry:   body.passportExpiry,
      email:            body.email,
      phone:            body.phone,
      hasUKVisa:        body.hasUKVisa   ?? false,
      previousRefusals: body.previousRefusals ?? false,
      travelHistory:    body.travelHistory,
      isSubmitted:      true,
      submittedAt:      new Date(),
    },
  })

  const updatedMembers = await prisma.groupHiveMember.findMany({
    where: { sessionId: hiveSession.id },
  })

  const newSubmittedCount = updatedMembers.filter(m => m.isSubmitted).length
  const allSubmitted      = newSubmittedCount >= hiveSession.memberCount

  if (allSubmitted) {
    await prisma.groupHiveSession.update({
      where: { id: hiveSession.id },
      data:  { status: 'complete' },
    })
  }

  return NextResponse.json({
    success:        true,
    slotNumber:     slot.slotNumber,
    submittedCount: newSubmittedCount,
    totalCount:     hiveSession.memberCount,
    isComplete:     allSubmitted,
  })
}
