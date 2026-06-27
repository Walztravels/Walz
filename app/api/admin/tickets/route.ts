import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type')   ?? 'all'
  const search = searchParams.get('search') ?? ''
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit  = 50
  const skip   = (page - 1) * limit

  try {
    const where: Prisma.GeneratedTicketWhereInput = {}
    if (type !== 'all') where.ticketType = type
    if (search) {
      where.OR = [
        { clientName:      { contains: search, mode: 'insensitive' } },
        { clientEmail:     { contains: search, mode: 'insensitive' } },
        { referenceNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [rows, total, statsRaw] = await Promise.all([
      prisma.generatedTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id:              true,
          referenceNumber: true,
          clientName:      true,
          clientEmail:     true,
          ticketType:      true,
          ticketData:      true,
          status:          true,
          sentAt:          true,
          generatedByName: true,
          downloadCount:   true,
          createdAt:       true,
          passengerName:   true,
          flightFrom:      true,
          flightTo:        true,
          flightDate:      true,
          airline:         true,
          flightNumber:    true,
          pnr:             true,
          hotelName:       true,
          checkInDate:     true,
          checkOutDate:    true,
        },
      }),
      prisma.generatedTicket.count({ where }),
      prisma.generatedTicket.groupBy({
        by: ['ticketType'],
        _count: { _all: true },
      }),
    ])

    const stats: Record<string, number> = {}
    statsRaw.forEach(r => { stats[r.ticketType] = r._count._all })

    const tickets = rows.map(r => ({
      id:                r.id,
      ticket_reference:  r.referenceNumber,
      client_name:       r.clientName,
      client_email:      r.clientEmail,
      ticket_type:       r.ticketType,
      ticket_data:       r.ticketData,
      status:            r.status,
      sent_at:           r.sentAt?.toISOString() ?? null,
      generated_by_name: r.generatedByName,
      download_count:    r.downloadCount,
      created_at:        r.createdAt.toISOString(),
      passenger_name:    r.passengerName,
      flight_from:       r.flightFrom,
      flight_to:         r.flightTo,
      flight_date:       r.flightDate,
      airline:           r.airline,
      flight_number:     r.flightNumber,
      pnr:               r.pnr,
      hotel_name:        r.hotelName,
      check_in_date:     r.checkInDate,
      check_out_date:    r.checkOutDate,
    }))

    return NextResponse.json({ tickets, total, page, pages: Math.ceil(total / limit), stats })
  } catch (err) {
    console.error('[GET /api/admin/tickets]', err)
    return NextResponse.json({ tickets: [], total: 0, page: 1, pages: 0, stats: {} })
  }
}
