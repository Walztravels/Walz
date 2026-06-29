import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // Find portal user
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, createdAt: true },
  })

  if (!user) return NextResponse.json({ user: null, unlinked: [] })

  // Find unlinked applications for this email
  const [visaApps, tripReqs, tourEnqs] = await Promise.all([
    prisma.visaApplication.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, userId: null },
      select: { id: true, createdAt: true, visaType: true, destinationIso2: true, referenceNumber: true },
    }),
    prisma.tripRequest.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, userId: null },
      select: { id: true, createdAt: true, destination: true, referenceNumber: true },
    }),
    prisma.tourEnquiry.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, userId: null },
      select: { id: true, createdAt: true },
    }),
  ])

  const unlinked = [
    ...visaApps.map(a => ({ id: a.id, type: 'visa', label: `Visa — ${a.visaType ?? a.destinationIso2}`, ref: a.referenceNumber, date: a.createdAt })),
    ...tripReqs.map(t => ({ id: t.id, type: 'trip', label: `Trip Request — ${t.destination ?? 'Custom'}`, ref: t.referenceNumber, date: t.createdAt })),
    ...tourEnqs.map(e => ({ id: e.id, type: 'tour', label: 'Tour Enquiry', ref: null, date: e.createdAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json({ user, unlinked })
}
