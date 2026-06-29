import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET — list all pending link requests
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const requests = await prisma.applicationLinkRequest.findMany({
    orderBy: { detectedAt: 'desc' },
  })

  // Group by userId so we can show all requests per user together
  const grouped = requests.reduce((acc, r) => {
    if (!acc[r.userId]) {
      acc[r.userId] = { userId: r.userId, userEmail: r.userEmail, detectedAt: r.detectedAt, requests: [] }
    }
    acc[r.userId].requests.push(r)
    return acc
  }, {} as Record<string, { userId: string; userEmail: string; detectedAt: Date; requests: typeof requests }>)

  return NextResponse.json({ requests, grouped: Object.values(grouped) })
}

// POST — manual link (admin-initiated, no pending state)
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as { userEmail: string; userId: string; applicationId: string; applicationType: string; applicationLabel?: string }

  // Create AND immediately approve
  const linkReq = await prisma.applicationLinkRequest.create({
    data: {
      userId:           body.userId,
      userEmail:        body.userEmail.toLowerCase().trim(),
      applicationId:    body.applicationId,
      applicationType:  body.applicationType,
      applicationLabel: body.applicationLabel ?? '',
      autoDetected:     false,
      status:           'pending',
    },
  })

  // Immediately approve it
  await approveLink(linkReq.id, body.userId, body.applicationId, body.applicationType, session.email ?? 'admin')

  return NextResponse.json({ success: true })
}

async function approveLink(linkId: string, userId: string, applicationId: string, applicationType: string, reviewerEmail: string) {
  // Update the application with userId
  if (applicationType === 'visa') {
    await prisma.visaApplication.update({ where: { id: applicationId }, data: { userId } }).catch(() => {})
  } else if (applicationType === 'trip') {
    await prisma.tripRequest.update({ where: { id: applicationId }, data: { userId } }).catch(() => {})
  } else if (applicationType === 'tour') {
    await prisma.tourEnquiry.update({ where: { id: applicationId }, data: { userId } }).catch(() => {})
  }

  await prisma.applicationLinkRequest.update({
    where: { id: linkId },
    data: { status: 'approved', reviewedBy: reviewerEmail, reviewedAt: new Date() },
  })
}

export { approveLink }
