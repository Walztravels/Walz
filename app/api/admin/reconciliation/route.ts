import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { BookingType, Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlightDetailsJson {
  supplierNet?: number
  [key: string]: unknown
}

interface HotelDetailsJson {
  supplierNet?: number
  [key: string]: unknown
}

interface PassengerJson {
  supplierNet?: number
  [key: string]: unknown
}

// ─── Helper: extract supplier net from booking JSON fields ───────────────────

function extractSupplierNet(
  flightDetails: Prisma.JsonValue | null,
  hotelDetails: Prisma.JsonValue | null,
  passengers: Prisma.JsonValue | null,
): number | null {
  // Try flightDetails.supplierNet
  if (flightDetails && typeof flightDetails === 'object' && !Array.isArray(flightDetails)) {
    const fd = flightDetails as FlightDetailsJson
    if (typeof fd.supplierNet === 'number') return fd.supplierNet
  }

  // Try hotelDetails.supplierNet
  if (hotelDetails && typeof hotelDetails === 'object' && !Array.isArray(hotelDetails)) {
    const hd = hotelDetails as HotelDetailsJson
    if (typeof hd.supplierNet === 'number') return hd.supplierNet
  }

  // Try passengers[0].supplierNet
  if (passengers && Array.isArray(passengers) && passengers.length > 0) {
    const first = passengers[0] as PassengerJson
    if (first && typeof first === 'object' && typeof first.supplierNet === 'number') {
      return first.supplierNet
    }
  }

  return null
}

// ─── GET /api/admin/reconciliation?from=DATE&to=DATE&type=TYPE ────────────────

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fromParam = searchParams.get('from') ?? ''
  const toParam = searchParams.get('to') ?? ''
  const typeParam = searchParams.get('type') ?? 'ALL'

  // Build date range
  const fromDate = fromParam ? new Date(fromParam) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  // Add 1 day to `to` for inclusive range (covers the entire last day)
  const toDate = toParam ? new Date(new Date(toParam).getTime() + 24 * 60 * 60 * 1000) : new Date()

  // Build type filter
  const validTypes = Object.values(BookingType) as string[]
  const typeFilter =
    typeParam !== 'ALL' && validTypes.includes(typeParam)
      ? { type: typeParam as BookingType }
      : {}

  const rawBookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: fromDate, lt: toDate },
      ...typeFilter,
    },
    select: {
      id: true,
      bookingReference: true,
      type: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      contactEmail: true,
      createdAt: true,
      flightDetails: true,
      hotelDetails: true,
      passengers: true,
      notes: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Compute per-row metrics
  const bookings = rawBookings.map(b => {
    const supplierNet = extractSupplierNet(b.flightDetails, b.hotelDetails, b.passengers)
    const grossProfit = supplierNet != null ? b.totalAmount - supplierNet : null
    const markupPct =
      supplierNet != null && supplierNet > 0
        ? ((b.totalAmount - supplierNet) / supplierNet) * 100
        : null

    return {
      id: b.id,
      bookingReference: b.bookingReference,
      type: b.type as string,
      status: b.status as string,
      paymentStatus: b.paymentStatus as string,
      contactEmail: b.contactEmail,
      currency: b.currency,
      totalAmount: b.totalAmount,
      supplierNet,
      grossProfit,
      markupPct,
      createdAt: b.createdAt.toISOString(),
    }
  })

  // Aggregate totals
  const total = bookings.length
  const revenue = bookings.reduce((s, b) => s + (b.totalAmount || 0), 0)

  const bookingsWithCost = bookings.filter(b => b.supplierNet != null)
  const cost = bookingsWithCost.reduce((s, b) => s + (b.supplierNet ?? 0), 0)
  const profit = bookingsWithCost.reduce((s, b) => s + (b.grossProfit ?? 0), 0)

  const margins = bookings
    .filter(b => b.markupPct != null)
    .map(b => b.markupPct as number)
  const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : 0

  return NextResponse.json({
    bookings,
    total,
    revenue,
    cost,
    profit,
    avgMargin,
  })
}
