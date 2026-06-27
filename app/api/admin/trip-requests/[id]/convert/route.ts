import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WALZ-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const request = await prisma.tripRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let duration: number | null = null
  if (request.departureDate && request.returnDate) {
    const start = new Date(request.departureDate), end = new Date(request.returnDate)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      duration = Math.ceil((end.getTime() - start.getTime()) / 86400000)
    }
  }

  const vibes = (() => { try { return JSON.parse(request.vibes || '[]') as string[] } catch { return [] } })()
  const tripLabel = vibes[0] || request.tripType || 'Trip'
  void tripLabel // suppress unused var lint
  const title = `${request.destination || 'Trip'} — ${request.firstName || ''} ${request.lastName || ''}`.trim()

  const noteLines = [
    request.mustDos ? `Must-dos: ${request.mustDos}` : '',
    request.dietaryNeeds ? `Dietary: ${request.dietaryNeeds}` : '',
    request.mobilityNeeds ? `Mobility: ${request.mobilityNeeds}` : '',
    request.notes ? `Notes: ${request.notes}` : '',
  ].filter(Boolean)

  const itinerary = await prisma.itinerary.create({
    data: {
      referenceNumber: generateRef(),
      title,
      clientName: `${request.firstName || ''} ${request.lastName || ''}`.trim() || 'Client',
      clientEmail: request.email || '',
      clientPhone: request.phone || null,
      destination: request.destination || '',
      startDate: request.departureDate ? new Date(request.departureDate) : null,
      endDate: request.returnDate ? new Date(request.returnDate) : null,
      duration,
      numberOfTravellers: request.numberOfTravellers || 1,
      tripType: request.tripType || 'leisure',
      currency: request.budgetCurrency || 'GBP',
      budget: request.budgetAmount || null,
      notes: noteLines.join('\n') || null,
      status: 'draft',
      type: 'itinerary',
    },
  })

  await prisma.tripRequest.update({ where: { id }, data: { status: 'converted', itineraryId: itinerary.id, updatedAt: new Date() } })

  return NextResponse.json({ success: true, itinerary, redirectTo: `/admin/itinerary-planner/${itinerary.id}` })
}
