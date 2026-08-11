import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/itinerary/[ref]/meta — public, lightweight metadata for the approval page
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const itin = await prisma.itinerary.findUnique({
    where:  { referenceNumber: ref },
    select: { title: true, destination: true, status: true, clientName: true, startDate: true, endDate: true },
  })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(itin)
}
