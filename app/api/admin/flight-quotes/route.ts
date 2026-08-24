import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { sendFlightQuoteEmail } from '@/lib/email-flight-quote'

export const dynamic = 'force-dynamic'

// POST /api/admin/flight-quotes — create a flight quote (no Duffel order created)
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    duffelOfferId, clientName, clientEmail, clientPhone,
    origin, destination, departureDate, returnDate,
    airline, cabinClass, displayPrice, currency,
  } = body

  if (!duffelOfferId || !origin || !destination || !departureDate || !airline || !cabinClass || !displayPrice || !currency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const quote = await prisma.flightQuote.create({
    data: {
      token,
      duffelOfferId,
      clientName:    clientName ?? null,
      clientEmail:   clientEmail ?? null,
      clientPhone:   clientPhone ?? null,
      origin,
      destination,
      departureDate: new Date(departureDate),
      returnDate:    returnDate ? new Date(returnDate) : null,
      airline,
      cabinClass,
      displayPrice,
      currency,
      createdBy:  session.email,
      expiresAt,
    },
  })

  if (clientEmail) {
    sendFlightQuoteEmail({
      to:            clientEmail,
      clientName:    clientName ?? 'Traveller',
      quoteToken:    token,
      origin,
      destination,
      departureDate: new Date(departureDate),
      returnDate:    returnDate ? new Date(returnDate) : null,
      airline,
      cabinClass,
      displayPrice:  Number(displayPrice),
      currency,
      staffName:     session.name,
      expiresAt,
    }).catch(() => {})
  }

  return NextResponse.json({
    quote: {
      id:    quote.id,
      token,
      link:  `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'}/quote/${token}`,
    },
  })
}

// GET /api/admin/flight-quotes — list quotes
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'all'
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = 20

  const where = status !== 'all' ? { status } : {}

  const [items, total] = await prisma.$transaction([
    prisma.flightQuote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.flightQuote.count({ where }),
  ])

  return NextResponse.json({
    items: items.map(q => ({ ...q, displayPrice: q.displayPrice.toString() })),
    total,
    pages: Math.ceil(total / limit),
  })
}
