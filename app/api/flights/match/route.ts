import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { matchFlightInSabre } from '@/lib/sabre/match'
import type { WalzFlight } from '@/lib/types/flight'

const matchSchema = z.object({
  flight: z.object({
    id: z.string(),
    source: z.enum(['google', 'skyscanner', 'sabre']),
    matchKey: z.string(),
    outbound: z.array(
      z.object({
        departureAirport: z.string(),
        arrivalAirport: z.string(),
        departureTime: z.string(),
        arrivalTime: z.string(),
        airline: z.string(),
        airlineCode: z.string(),
        flightNumber: z.string(),
        duration: z.number(),
        aircraft: z.string().optional(),
        cabinClass: z.string(),
        bookingCode: z.string(),
      })
    ),
    inbound: z.array(z.unknown()).optional(),
    price: z.object({
      amount: z.number(),
      currency: z.string(),
      perPerson: z.number(),
    }),
    displayPrice: z.object({
      amount: z.number(),
      currency: z.string(),
      perPerson: z.number(),
    }),
    stops: z.number(),
    totalDuration: z.number(),
    cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']),
    isRefundable: z.boolean(),
    validatingCarrier: z.string(),
  }),
  adults: z.number().int().min(1).max(9).default(1),
  currency: z.string().length(3).default('GBP'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = matchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { flight, adults, currency } = parsed.data

    // If flight is already from Sabre we don't need to match — just confirm bookable
    if (flight.source === 'sabre') {
      return NextResponse.json({
        bookable: true,
        sabrePrice: flight.price,
        priceDiffPct: 0,
        sabreSolutionId: flight.matchKey,
      })
    }

    const result = await matchFlightInSabre(flight as unknown as WalzFlight, adults, currency)

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    console.error('[FlightsMatch API] Error:', err)
    return NextResponse.json(
      { error: 'Could not confirm flight availability. Please try again.' },
      { status: 500 }
    )
  }
}
