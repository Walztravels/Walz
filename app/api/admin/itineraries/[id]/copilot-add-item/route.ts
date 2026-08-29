// app/api/admin/itineraries/[id]/copilot-add-item/route.ts
// Adds a flight, hotel, or tour item to an itinerary from the Jade Copilot

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { itemType, item } = await req.json() as {
    itemType: 'flight' | 'hotel' | 'tour'
    item: Record<string, unknown>
  }

  const itin = await prisma.itinerary.findUnique({
    where: { id },
    select: { flights: true, hotels: true, tours: true },
  })

  if (!itin) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

  const newItem = { ...item, id: uid() }

  let updateData: Record<string, string>

  if (itemType === 'flight') {
    const flights = safeParse<Record<string, unknown>[]>(itin.flights, [])
    flights.push(newItem)
    updateData = { flights: JSON.stringify(flights) }
  } else if (itemType === 'hotel') {
    const hotels = safeParse<Record<string, unknown>[]>(itin.hotels, [])
    hotels.push(newItem)
    updateData = { hotels: JSON.stringify(hotels) }
  } else if (itemType === 'tour') {
    const tours = safeParse<Record<string, unknown>[]>(itin.tours ?? '[]', [])
    tours.push(newItem)
    updateData = { tours: JSON.stringify(tours) }
  } else {
    return NextResponse.json({ error: 'Unknown itemType' }, { status: 400 })
  }

  await prisma.itinerary.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() },
  })

  return NextResponse.json({ ok: true, item: newItem })
}
