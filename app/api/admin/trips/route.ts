import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTripDetail(detail: string | null | undefined): Record<string, string> {
  if (!detail) return {}
  try { return JSON.parse(detail) as Record<string, string> } catch { return {} }
}

// Extracts tripRef from a booking's notes JSON string.
function bookingTripRef(notes: string | null | undefined): string | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>
    if (typeof parsed.tripRef === 'string') return parsed.tripRef
  } catch { /* plain text notes */ }
  return null
}

// ─── GET /api/admin/trips?ref=WALZ-TRIP-XXXXXX ───────────────────────────────
// Returns { trip: TripMeta | null, bookings: BookingRow[] }
// The trip is stored as an ActivityLog record where:
//   action = 'TRIP_CREATED', entityId = ref, entityType = 'Trip'
// Linked bookings are found via booking.notes JSON { tripRef: 'WALZ-TRIP-...' }
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ref = searchParams.get('ref')

  // ── Workspace lookup by ref ──
  if (ref) {
    const log = await prisma.activityLog.findFirst({
      where: { action: 'TRIP_CREATED', entityId: ref, entityType: 'Trip' },
      orderBy: { createdAt: 'desc' },
    })

    if (!log) {
      return NextResponse.json({ trip: null, bookings: [] }, { status: 404 })
    }

    const meta = parseTripDetail(log.detail)

    const trip = {
      reference: ref,
      title: meta.title ?? '',
      clientName: meta.clientName ?? '',
      clientEmail: meta.clientEmail ?? '',
      departDate: meta.departDate ?? '',
      returnDate: meta.returnDate ?? '',
      destination: meta.destination ?? '',
      notes: meta.notes ?? '',
      createdAt: log.createdAt.toISOString(),
    }

    // Find bookings whose notes JSON contains this tripRef
    const allBookings = await prisma.booking.findMany({
      where: { notes: { contains: ref } },
      select: {
        id: true,
        bookingReference: true,
        type: true,
        status: true,
        paymentStatus: true,
        contactEmail: true,
        totalAmount: true,
        currency: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter to only bookings that actually have this exact tripRef in notes
    const bookings = allBookings
      .filter(b => bookingTripRef(b.notes) === ref)
      .map(({ notes: _notes, ...rest }) => ({
        ...rest,
        createdAt: rest.createdAt.toISOString(),
      }))

    return NextResponse.json({ trip, bookings })
  }

  // ── List all trip workspaces ──
  const logs = await prisma.activityLog.findMany({
    where: { action: 'TRIP_CREATED', entityType: 'Trip' },
    orderBy: { createdAt: 'desc' },
  })

  const trips = logs.map(log => {
    const meta = parseTripDetail(log.detail)
    return {
      reference: log.entityId ?? '',
      title: meta.title ?? '',
      clientName: meta.clientName ?? '',
      destination: meta.destination ?? '',
      departDate: meta.departDate ?? '',
      returnDate: meta.returnDate ?? '',
      createdAt: log.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ trips })
}

// ─── POST /api/admin/trips ────────────────────────────────────────────────────
// Body: { reference, title, clientName, clientEmail, departDate, returnDate, destination, notes }
// Stores the workspace as an ActivityLog record.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    reference: string
    title: string
    clientName?: string
    clientEmail?: string
    departDate?: string
    returnDate?: string
    destination?: string
    notes?: string
  }

  const { reference, title, clientName, clientEmail, departDate, returnDate, destination, notes } = body

  if (!reference || !title) {
    return NextResponse.json({ error: 'reference and title are required' }, { status: 400 })
  }

  // Check for duplicate reference
  const existing = await prisma.activityLog.findFirst({
    where: { action: 'TRIP_CREATED', entityId: reference, entityType: 'Trip' },
  })
  if (existing) {
    return NextResponse.json({ error: 'A workspace with this reference already exists' }, { status: 409 })
  }

  await prisma.activityLog.create({
    data: {
      action: 'TRIP_CREATED',
      entityId: reference,
      entityType: 'Trip',
      module: 'trips',
      staffId: session.id ?? undefined,
      staffName: session.name ?? undefined,
      staffRole: session.roleTitle ?? undefined,
      detail: JSON.stringify({
        title,
        clientName: clientName ?? '',
        clientEmail: clientEmail ?? '',
        departDate: departDate ?? '',
        returnDate: returnDate ?? '',
        destination: destination ?? '',
        notes: notes ?? '',
        createdAt: new Date().toISOString(),
      }),
    },
  })

  return NextResponse.json({ success: true, reference })
}

// ─── PATCH /api/admin/trips ───────────────────────────────────────────────────
// Body: { reference, ...fields }
// Updates the detail JSON on the ActivityLog record.
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, string>
  const { reference, ...fields } = body

  if (!reference) return NextResponse.json({ error: 'reference is required' }, { status: 400 })

  const log = await prisma.activityLog.findFirst({
    where: { action: 'TRIP_CREATED', entityId: reference, entityType: 'Trip' },
    orderBy: { createdAt: 'desc' },
  })

  if (!log) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const current = parseTripDetail(log.detail)
  const updated = { ...current, ...fields }

  await prisma.activityLog.update({
    where: { id: log.id },
    data: { detail: JSON.stringify(updated) },
  })

  return NextResponse.json({ success: true })
}
