import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateFlightICS } from '@/lib/generateICS'
import type { FlightLeg } from '@/types/flight-ticket'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) {
    return NextResponse.json({ error: 'ref is required' }, { status: 400 })
  }

  // Fetch ticket from DB
  let rows: Array<{ ticket_data: unknown; ticket_reference: string }> = []
  try {
    rows = await prisma.$queryRawUnsafe<Array<{ ticket_data: unknown; ticket_reference: string }>>(
      `SELECT ticket_data, ticket_reference FROM generated_tickets WHERE ticket_reference = $1 LIMIT 1`,
      ref,
    )
  } catch (err) {
    console.error('[calendar] DB error', err)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const data = rows[0].ticket_data as Record<string, unknown>

  const outbound  = (data.outbound  as FlightLeg[] | undefined) ?? []
  const inbound   = (data.inbound   as FlightLeg[] | undefined) ?? []
  const firstName = (data.firstName as string | undefined) ?? ''
  const lastName  = (data.lastName  as string | undefined) ?? ''
  const pnr       = (data.pnr       as string | undefined) ?? ref

  if (!outbound.length) {
    return NextResponse.json({ error: 'No flight legs found in ticket data' }, { status: 422 })
  }

  const passengerName = [firstName, lastName].filter(Boolean).join(' ') || 'Passenger'
  const icsContent    = generateFlightICS(outbound, inbound, passengerName, ref, pnr)

  return new Response(icsContent, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="walz-flights-${ref}.ics"`,
      'Cache-Control':       'no-cache',
    },
  })
}
