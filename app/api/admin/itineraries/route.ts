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

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const type = searchParams.get('type')
  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status
  if (type) where.type = type
  if (search) where.OR = [
    { clientName: { contains: search, mode: 'insensitive' } },
    { title: { contains: search, mode: 'insensitive' } },
    { destination: { contains: search, mode: 'insensitive' } },
    { referenceNumber: { contains: search, mode: 'insensitive' } },
  ]
  const itineraries = await prisma.itinerary.findMany({ where, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ itineraries })
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await req.json()
  const itinerary = await prisma.itinerary.create({
    data: {
      referenceNumber: generateRef(),
      title: body.title,
      clientName: body.clientName,
      clientEmail: body.clientEmail,
      clientPhone: body.clientPhone || null,
      destination: body.destination,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      duration: body.duration || null,
      numberOfTravellers: body.numberOfTravellers || 1,
      tripType: body.tripType || null,
      currency: body.currency || 'GBP',
      type: body.type || 'itinerary',
      status: 'draft',
      createdBy: body.createdBy || null,
    },
  })
  return NextResponse.json({ itinerary })
}
