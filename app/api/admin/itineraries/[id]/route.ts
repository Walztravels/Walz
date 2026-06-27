import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const itinerary = await prisma.itinerary.findUnique({ where: { id } })
  if (!itinerary) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ itinerary })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = { updatedAt: new Date() }
  const stringFields = [
    'title', 'status', 'type', 'clientName', 'clientEmail', 'clientPhone',
    'destination', 'overview', 'notes', 'terms', 'coverImage', 'selectedOption',
    'createdBy', 'assignedTo', 'tripType', 'currency', 'days', 'flights', 'hotels',
    'inclusions', 'exclusions', 'attachments', 'options', 'priceBreakdown',
    'clientSignature', 'approvedBy',
  ]
  for (const f of stringFields) if (f in body) data[f] = body[f]
  if ('numberOfTravellers' in body) data.numberOfTravellers = Number(body.numberOfTravellers)
  if ('duration' in body) data.duration = body.duration !== null ? Number(body.duration) : null
  if ('totalPrice' in body) data.totalPrice = body.totalPrice !== null ? Number(body.totalPrice) : null
  if ('deposit' in body) data.deposit = body.deposit !== null ? Number(body.deposit) : null
  if ('budget' in body) data.budget = body.budget !== null ? Number(body.budget) : null
  if ('viewCount' in body) data.viewCount = Number(body.viewCount)
  if ('tags' in body) data.tags = body.tags
  const dateFields = ['startDate', 'endDate', 'depositDue', 'balanceDue', 'sentAt', 'approvedAt', 'viewedAt']
  for (const f of dateFields) if (f in body) data[f] = body[f] ? new Date(body[f]) : null
  const itinerary = await prisma.itinerary.update({ where: { id }, data })
  return NextResponse.json({ itinerary })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  await prisma.itinerary.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
