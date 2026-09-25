// app/api/admin/itineraries/[id]/copilot-add-item/route.ts
// Adds a flight, hotel, or tour item to an itinerary from the Jade Copilot

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/admin/permissions'
import { addOfferToItinerary } from '@/lib/itinerary/add-offer'

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

  const { itemType, item, offerId: topOfferId, allowDuplicate } = await req.json() as {
    itemType: 'flight' | 'hotel' | 'tour'
    item: Record<string, unknown>
    offerId?: string
    allowDuplicate?: boolean
  }

  // FLIGHTS: identical to Research → Add. The browser supplies only the Duffel
  // offer id; the shared core re-fetches the offer and builds ONE unified
  // booking (all journeys, one total). We NEVER store a browser-supplied
  // single-leg row for a flight: a result without an offerId is refused.
  if (itemType === 'flight') {
    // Same gate as research-add: supplier call + priced write need 'bookings'.
    if (!hasPermission(session, 'bookings')) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const offerId = typeof (item?.offerId ?? topOfferId) === 'string' ? String(item?.offerId ?? topOfferId).trim() : ''
    if (!offerId) {
      return NextResponse.json(
        { ok: false, error: 'This flight result has no supplier offer id (it may be from an older search). Please search again and add it from the new results.', code: 'OFFER_ID_REQUIRED' },
        { status: 400 },
      )
    }
    const r = await addOfferToItinerary({
      itineraryId: id,
      session,
      payload: { type: 'flight', offerId },
      allowDuplicate: allowDuplicate === true,
      source: 'copilot',
      cookie: req.headers.get('cookie') ?? '',
    })
    if (r.status !== 200) return NextResponse.json(r.body, { status: r.status })
    return NextResponse.json({ ...r.body, item: r.body.booking })
  }

  const itin = await prisma.itinerary.findUnique({
    where: { id },
    select: { flights: true, hotels: true, tours: true },
  })

  if (!itin) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

  const newItem = { ...item, id: uid() }

  let updateData: Record<string, string>

  if (itemType === 'hotel') {
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
