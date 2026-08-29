import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { prisma } from '@/lib/db'
import { BUSINESS } from '@/lib/config/business'
import { ItineraryPDF } from '@/lib/pdf/ItineraryPDF'
import { getAuthoritativeClientTotal, parseAcceptanceSnapshot } from '@/lib/acceptance-snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ ref: string }> }

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { ref } = await params

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only serve PDF for non-draft itineraries
  if (!['proposal', 'approved', 'live'].includes(itin.status)) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  // ── Safe serialisation — NO internal fields ──────────────────────────────
  // Never include: supplierCost, netRate, markup, margin, internalNotes,
  // admin metadata, staff-only fields, API payloads
  const days = safeParse<Array<{
    day: number; title: string; destination?: string; description?: string
    activities?: string[]; meals?: string; accommodation?: string
    clientNotes?: string; notes?: string
  }>>(itin.days, []).map(d => ({
    day: d.day,
    title: d.title,
    destination: d.destination,
    description: d.description,
    activities: d.activities,
    meals: d.meals,
    accommodation: d.accommodation,
    clientNotes: d.clientNotes ?? d.notes,
  }))

  const flights = safeParse<Array<{
    from?: string; to?: string; airline?: string; flightNumber?: string
    date?: string; time?: string; departureTime?: string; arrivalTime?: string
    class?: string; pnr?: string; cost?: number; stops?: number
  }>>(itin.flights, []).map(f => ({
    from: f.from,
    to: f.to,
    airline: f.airline,
    flightNumber: f.flightNumber,
    date: f.date,
    time: f.time,
    departureTime: f.departureTime,
    arrivalTime: f.arrivalTime,
    class: f.class,
    pnr: f.pnr,
    // cost: only include client-visible cost if present
    cost: typeof f.cost === 'number' ? f.cost : undefined,
    stops: f.stops,
  }))

  const hotels = safeParse<Array<{
    name?: string; location?: string; checkIn?: string; checkOut?: string
    roomType?: string; nights?: number; cost?: number; mealPlan?: string
  }>>(itin.hotels, []).map(h => ({
    name: h.name,
    location: h.location,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    roomType: h.roomType,
    nights: h.nights,
    mealPlan: h.mealPlan,
    // cost: client price only — supplier cost never passed
    cost: typeof h.cost === 'number' ? h.cost : undefined,
  }))

  const transfers = safeParse<Array<{
    type?: string; from?: string; to?: string; date?: string; vehicle?: string; cost?: number
  }>>(itin.transfers, []).map(t => ({
    type: t.type,
    from: t.from,
    to: t.to,
    date: t.date,
    vehicle: t.vehicle,
    cost: typeof t.cost === 'number' ? t.cost : undefined,
  }))

  const tours = safeParse<Array<{
    name?: string; location?: string; date?: string; duration?: string; provider?: string; cost?: number
  }>>(itin.tours, []).map(t => ({
    name: t.name,
    location: t.location,
    date: t.date,
    duration: t.duration,
    provider: t.provider,
    cost: typeof t.cost === 'number' ? t.cost : undefined,
  }))

  const inclusions = safeParse<string[]>(itin.inclusions, [])
  const exclusions = safeParse<string[]>(itin.exclusions, [])
  const priceBreakdown = safeParse<Array<{ item: string; description?: string; cost: number }>>(itin.priceBreakdown, [])

  // GA6: for approved itineraries, use the immutable accepted total from the snapshot
  const snap = parseAcceptanceSnapshot(itin.selectedOption)
  const authoritativeTotal = getAuthoritativeClientTotal(itin.status, itin.selectedOption, itin.totalPrice)

  const buffer = await renderToBuffer(
    React.createElement(ItineraryPDF, {
      referenceNumber: itin.referenceNumber,
      title: itin.title,
      clientName: itin.clientName ?? undefined,
      destination: itin.destination ?? undefined,
      startDate: itin.startDate,
      endDate: itin.endDate,
      duration: itin.duration,
      numberOfTravellers: itin.numberOfTravellers,
      tripType: itin.tripType,
      currency: itin.currency,
      overview: itin.overview,
      totalPrice: authoritativeTotal,
      deposit: snap?.deposit ?? itin.deposit,
      days,
      flights,
      hotels,
      transfers,
      tours,
      inclusions,
      exclusions,
      priceBreakdown,
      contactWhatsApp: BUSINESS.contacts.globalWhatsapp.display,
      contactEmail: BUSINESS.contacts.email,
      contactWebsite: 'walztravels.com',
      acceptedBy: snap?.acceptedBy,
      acceptedAt: snap?.acceptedAt,
      acceptedTotal: snap?.acceptedTotal ?? undefined,
    })
  )

  const filename = `Walz-Itinerary-${itin.referenceNumber}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}
