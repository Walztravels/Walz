import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { patchOptions, parseOptions } from '@/lib/itinerary-options'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const itinerary = await prisma.itinerary.findUnique({ where: { id } })
  if (!itinerary) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ itinerary })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = { updatedAt: new Date() }

  // 'options' is handled separately below with merge logic — exclude from bulk copy
  const stringFields = [
    'title', 'status', 'type', 'clientName', 'clientEmail', 'clientPhone',
    'destination', 'destinations', 'overview', 'notes', 'terms', 'coverImage',
    // 'selectedOption' intentionally excluded — acceptance snapshot is immutable
    // and must only be written by the /approve endpoint.
    'createdBy', 'assignedTo', 'tripType', 'currency', 'days', 'flights', 'hotels',
    'transfers', 'tours', 'trains', 'ferries',
    'inclusions', 'exclusions', 'attachments', 'priceBreakdown',
    'clientSignature', 'approvedBy',
  ]
  for (const f of stringFields) if (f in body) data[f] = body[f]

  // Merge 'options' safely to preserve approval tokens and future metadata keys.
  // Never let a partial options write from any caller silently wipe approval tokens.
  if ('options' in body) {
    const current = await prisma.itinerary.findUnique({ where: { id }, select: { options: true } })
    const patch = parseOptions(body.options as string | null)
    data.options = patchOptions(current?.options, patch)
  }
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

  // Phase 3: fire-and-forget sync to normalized tables when booking arrays change
  const syncTriggers = ['days', 'flights', 'hotels', 'transfers', 'tours', 'trains', 'ferries']
  if (syncTriggers.some(f => f in body)) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'}/api/admin/itineraries/${id}/sync`, {
      method: 'POST',
      headers: { Cookie: req.headers.get('cookie') ?? '' },
    }).catch(() => {})
  }

  return NextResponse.json({ itinerary })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.itinerary.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
