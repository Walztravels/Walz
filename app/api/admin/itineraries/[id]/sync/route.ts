import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'

// POST /api/admin/itineraries/[id]/sync
// Reads the current JSON blobs from the Itinerary row and upserts each item
// into the normalized child tables. Safe to call multiple times (idempotent).
// Called automatically after a PATCH save, and can be triggered manually.

export const maxDuration = 30

function safe<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}

type AnyItem = Record<string, unknown>

function parseDate(v: unknown): string | null {
  if (!v || typeof v !== 'string' || v.trim() === '') return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sb = getSupabaseAdmin()

  const days      = safe<AnyItem[]>(itin.days,                [])
  const flights   = safe<AnyItem[]>(itin.flights,             [])
  const hotels    = safe<AnyItem[]>(itin.hotels,              [])
  const transfers = safe<AnyItem[]>(itin.transfers ?? '[]',   [])
  const tours     = safe<AnyItem[]>(itin.tours     ?? '[]',   [])
  const trains    = safe<AnyItem[]>(itin.trains    ?? '[]',   [])
  const ferries   = safe<AnyItem[]>(itin.ferries   ?? '[]',   [])

  const results: Record<string, string> = {}

  // Days
  if (days.length > 0) {
    const { error } = await sb.from('itinerary_days').upsert(
      days.map((d, i) => ({
        itinerary_id:   id,
        external_id:    String(d.id ?? `day-${d.day}`),
        day_number:     Number(d.day) || i + 1,
        title:          String(d.title ?? ''),
        description:    String(d.description ?? ''),
        activities:     Array.isArray(d.activities) ? d.activities.map(String) : [],
        accommodation:  String(d.accommodation ?? ''),
        destination:    String(d.destination ?? ''),
        meals:          String(d.meals ?? ''),
        weather:        String(d.weather ?? ''),
        dress_code:     String(d.dressCode ?? ''),
        client_notes:   String(d.clientNotes ?? ''),
        internal_notes: String(d.internalNotes ?? ''),
        order:          i,
        updated_at:     new Date().toISOString(),
      })),
      { onConflict: 'itinerary_id,day_number' }
    )
    results.days = error ? `error: ${error.message}` : `synced ${days.length}`
  }

  // Flights
  if (flights.length > 0) {
    const { error } = await sb.from('itinerary_flights').upsert(
      flights.map((f, i) => ({
        itinerary_id:     id,
        external_id:      String(f.id ?? ''),
        from:             String(f.from ?? ''),
        to:               String(f.to ?? ''),
        airline:          String(f.airline ?? ''),
        iata_code:        String(f.iataCode ?? ''),
        flight_number:    String(f.flightNumber ?? ''),
        date:             parseDate(f.date),
        departure_time:   String(f.time ?? ''),
        arrival_time:     String(f.arrivalTime ?? ''),
        class:            String(f.class ?? ''),
        pnr:              String(f.pnr ?? ''),
        client_price:     f.cost != null ? Number(f.cost) : null,
        supplier_cost:    f.supplierCost != null ? Number(f.supplierCost) : null,
        status:           String(f.status ?? 'pending'),
        notes:            String(f.notes ?? ''),
        supplier_id:      String(f.supplierId ?? '') || null,
        duffel_order_id:  String(f.duffelOrderId ?? '') || null,
        order:            i,
        updated_at:       new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.flights = error ? `error: ${error.message}` : `synced ${flights.length}`
  }

  // Hotels
  if (hotels.length > 0) {
    const { error } = await sb.from('itinerary_hotels').upsert(
      hotels.map((h, i) => ({
        itinerary_id:                    id,
        external_id:                     String(h.id ?? ''),
        name:                            String(h.name ?? ''),
        location:                        String(h.location ?? ''),
        website_url:                     String(h.websiteUrl ?? '') || null,
        check_in:                        parseDate(h.checkIn),
        check_out:                       parseDate(h.checkOut),
        room_type:                       String(h.roomType ?? ''),
        nights:                          h.nights != null ? Number(h.nights) : null,
        client_price:                    h.cost != null ? Number(h.cost) : null,
        supplier_cost:                   h.supplierCost != null ? Number(h.supplierCost) : null,
        status:                          String(h.status ?? 'pending'),
        notes:                           String(h.notes ?? ''),
        image_url:                       String(h.image ?? '') || null,
        supplier_id:                     String(h.supplierId ?? '') || null,
        hotelbeds_cancellation_reference: String(h.hotelbedsCancellationReference ?? '') || null,
        order:                           i,
        updated_at:                      new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.hotels = error ? `error: ${error.message}` : `synced ${hotels.length}`
  }

  // Transfers
  if (transfers.length > 0) {
    const { error } = await sb.from('itinerary_transfers').upsert(
      transfers.map((t, i) => ({
        itinerary_id:  id,
        external_id:   String(t.id ?? ''),
        type:          String(t.type ?? ''),
        from:          String(t.from ?? ''),
        to:            String(t.to ?? ''),
        date:          parseDate(t.date),
        time:          String(t.time ?? ''),
        vehicle:       String(t.vehicle ?? ''),
        provider:      String(t.provider ?? ''),
        client_price:  t.cost != null ? Number(t.cost) : null,
        supplier_cost: t.supplierCost != null ? Number(t.supplierCost) : null,
        notes:         String(t.notes ?? ''),
        image_url:     String(t.image ?? '') || null,
        supplier_id:   String(t.supplierId ?? '') || null,
        order:         i,
        updated_at:    new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.transfers = error ? `error: ${error.message}` : `synced ${transfers.length}`
  }

  // Tours
  if (tours.length > 0) {
    const { error } = await sb.from('itinerary_tours').upsert(
      tours.map((t, i) => ({
        itinerary_id:  id,
        external_id:   String(t.id ?? ''),
        name:          String(t.name ?? ''),
        location:      String(t.location ?? ''),
        date:          parseDate(t.date),
        time:          String(t.time ?? ''),
        duration:      String(t.duration ?? ''),
        provider:      String(t.provider ?? ''),
        client_price:  t.cost != null ? Number(t.cost) : null,
        supplier_cost: t.supplierCost != null ? Number(t.supplierCost) : null,
        notes:         String(t.notes ?? ''),
        image_url:     String(t.image ?? '') || null,
        supplier_id:   String(t.supplierId ?? '') || null,
        order:         i,
        updated_at:    new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.tours = error ? `error: ${error.message}` : `synced ${tours.length}`
  }

  // Trains
  if (trains.length > 0) {
    const { error } = await sb.from('itinerary_trains').upsert(
      trains.map((t, i) => ({
        itinerary_id:   id,
        external_id:    String(t.id ?? ''),
        from:           String(t.from ?? ''),
        to:             String(t.to ?? ''),
        date:           parseDate(t.date),
        departure_time: String(t.departureTime ?? ''),
        arrival_time:   String(t.arrivalTime ?? ''),
        train_number:   String(t.trainNumber ?? ''),
        class:          String(t.class ?? ''),
        provider:       String(t.provider ?? ''),
        pnr:            String(t.pnr ?? ''),
        client_price:   t.cost != null ? Number(t.cost) : null,
        supplier_cost:  t.supplierCost != null ? Number(t.supplierCost) : null,
        notes:          String(t.notes ?? ''),
        image_url:      String(t.image ?? '') || null,
        supplier_id:    String(t.supplierId ?? '') || null,
        order:          i,
        updated_at:     new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.trains = error ? `error: ${error.message}` : `synced ${trains.length}`
  }

  // Ferries
  if (ferries.length > 0) {
    const { error } = await sb.from('itinerary_ferries').upsert(
      ferries.map((fe, i) => ({
        itinerary_id:   id,
        external_id:    String(fe.id ?? ''),
        from:           String(fe.from ?? ''),
        to:             String(fe.to ?? ''),
        date:           parseDate(fe.date),
        departure_time: String(fe.departureTime ?? ''),
        arrival_time:   String(fe.arrivalTime ?? ''),
        operator:       String(fe.operator ?? ''),
        class:          String(fe.class ?? ''),
        vessel:         String(fe.vessel ?? ''),
        client_price:   fe.cost != null ? Number(fe.cost) : null,
        supplier_cost:  fe.supplierCost != null ? Number(fe.supplierCost) : null,
        notes:          String(fe.notes ?? ''),
        image_url:      String(fe.image ?? '') || null,
        supplier_id:    String(fe.supplierId ?? '') || null,
        order:          i,
        updated_at:     new Date().toISOString(),
      })),
      { onConflict: 'external_id' }
    )
    results.ferries = error ? `error: ${error.message}` : `synced ${ferries.length}`
  }

  return NextResponse.json({ ok: true, results })
}
