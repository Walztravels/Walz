import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: tripId } = await params
  const data = await req.json()

  const item = await prisma.tripItem.create({
    data: {
      tripId,
      dayId: data.dayId || null,
      type: data.type || 'CUSTOM',
      title: data.title,
      description: data.description,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      cost: data.cost ? parseFloat(String(data.cost)) : null,
      currency: data.currency || 'GBP',
      imageUrl: data.imageUrl,
      externalUrl: data.externalUrl,
      bookingRef: data.bookingRef,
      confirmed: data.confirmed || false,
      order: data.order || 0,
      metadata: data.metadata || {},
    },
  })
  return NextResponse.json({ item })
}
