import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { BUSINESS } from '@/lib/config/business'

export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Find an item in a JSON array by id, name, or numeric index string.
 * Never exposes cost / margin / internalNote to the caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findItem(arr: any[], itemId: string): any | null {
  if (!arr.length) return null
  // Prefer id match
  const byId = arr.find((x) => x?.id === itemId)
  if (byId) return byId
  // Then name / flightNumber match
  const byName = arr.find(
    (x) => x?.name === itemId || x?.flightNumber === itemId || x?.confirmationRef === itemId,
  )
  if (byName) return byName
  // Finally numeric index
  const idx = parseInt(itemId)
  if (!isNaN(idx) && idx >= 0 && idx < arr.length) return arr[idx]
  return null
}

// ── POST /api/admin/itineraries/[id]/voucher ──────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { type, itemId } = body as { type?: string; itemId?: string }

  if (!type || !itemId) {
    return NextResponse.json({ error: 'type and itemId are required' }, { status: 400 })
  }

  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

  const base = {
    referenceNumber: itin.referenceNumber,
    clientName: itin.clientName,
    numberOfTravellers: itin.numberOfTravellers,
    generatedAt: new Date().toISOString(),
    contactEmail: BUSINESS.contacts.email,
  }

  // ── hotel ──────────────────────────────────────────────────────────────────
  if (type === 'hotel') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = safeParse<any[]>(itin.hotels, [])
    const h = findItem(hotels, itemId)
    if (!h) return NextResponse.json({ error: 'Hotel not found in itinerary' }, { status: 404 })

    return NextResponse.json({
      ...base,
      voucherType: 'Hotel',
      item: {
        name: h.name ?? null,
        location: h.location ?? null,
        checkIn: h.checkIn ?? null,
        checkOut: h.checkOut ?? null,
        roomType: h.roomType ?? null,
        nights: h.nights ?? null,
        confirmationNumber: h.confirmationNumber ?? h.confirmationRef ?? null,
      },
    })
  }

  // ── flight ─────────────────────────────────────────────────────────────────
  if (type === 'flight') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flights = safeParse<any[]>(itin.flights, [])
    const f = findItem(flights, itemId)
    if (!f) return NextResponse.json({ error: 'Flight not found in itinerary' }, { status: 404 })

    return NextResponse.json({
      ...base,
      voucherType: 'Flight',
      item: {
        from: f.from ?? null,
        to: f.to ?? null,
        airline: f.airline ?? null,
        flightNumber: f.flightNumber ?? null,
        date: f.date ?? null,
        departureTime: f.time ?? f.departureTime ?? null,
        arrivalTime: f.arrivalTime ?? null,
        class: f.class ?? null,
        pnr: f.pnr ?? null,
      },
    })
  }

  // ── transfer ───────────────────────────────────────────────────────────────
  if (type === 'transfer') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfers = safeParse<any[]>(itin.transfers ?? '[]', [])
    const t = findItem(transfers, itemId)
    if (!t) return NextResponse.json({ error: 'Transfer not found in itinerary' }, { status: 404 })

    return NextResponse.json({
      ...base,
      voucherType: 'Transfer',
      item: {
        from: t.from ?? null,
        to: t.to ?? null,
        type: t.type ?? null,
        vehicle: t.vehicle ?? null,
        date: t.date ?? null,
        time: t.time ?? null,
        provider: t.provider ?? null,
        confirmationRef: t.confirmationRef ?? null,
      },
    })
  }

  // ── activity ───────────────────────────────────────────────────────────────
  if (type === 'activity') {
    // Activities are stored in tours
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tours = safeParse<any[]>(itin.tours ?? '[]', [])
    const a = findItem(tours, itemId)
    if (!a) return NextResponse.json({ error: 'Activity not found in itinerary' }, { status: 404 })

    return NextResponse.json({
      ...base,
      voucherType: 'Activity',
      item: {
        name: a.name ?? null,
        location: a.location ?? null,
        date: a.date ?? null,
        time: a.time ?? null,
        provider: a.provider ?? null,
        confirmationRef: a.confirmationRef ?? null,
      },
    })
  }

  return NextResponse.json(
    { error: 'type must be one of: hotel, flight, transfer, activity' },
    { status: 400 },
  )
}
