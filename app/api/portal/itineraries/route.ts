// app/api/portal/itineraries/route.ts
// Release 6.2: Customer-facing proposals list by userId.
// Ownership is always by userId — never match by client-supplied email in the request.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const proposals = await prisma.itinerary.findMany({
    where: {
      userId: session.user.id,
      status: { not: 'draft' },
    },
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      status: true,
      destination: true,
      startDate: true,
      endDate: true,
      totalPrice: true,
      currency: true,
      sentAt: true,
      approvedAt: true,
      numberOfTravellers: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ proposals })
}
