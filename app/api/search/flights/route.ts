import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchAllSources } from '@/lib/flights/merge'
import { cacheGet, cacheSet } from '@/lib/redis'

const CACHE_TTL = 8 * 60 // 8 minutes

const segmentSchema = z.object({
  origin: z.string().length(3, 'Origin must be a 3-letter IATA code'),
  destination: z.string().length(3, 'Destination must be a 3-letter IATA code'),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
})

// Common passenger / preferences fields
const commonFields = {
  adults: z.number().int().min(1).max(9).default(1),
  children: z.number().int().min(0).max(8).default(0),
  infants: z.number().int().min(0).max(4).default(0),
  cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY'),
  directOnly: z.boolean().default(false),
  currency: z.string().length(3).default('GBP'),
}

const regularSearchSchema = z.object({
  tripType: z.enum(['oneway', 'roundtrip']).optional(),
  origin: z.string().length(3, 'Origin must be a 3-letter IATA code'),
  destination: z.string().length(3, 'Destination must be a 3-letter IATA code'),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...commonFields,
})

const multiCitySearchSchema = z.object({
  tripType: z.literal('multicity'),
  segments: z.array(segmentSchema).min(2, 'At least 2 flight legs are required').max(5, 'Maximum 5 flight legs allowed'),
  ...commonFields,
})

type RegularSearchParams = z.infer<typeof regularSearchSchema>
type MultiCitySearchParams = z.infer<typeof multiCitySearchSchema>

function cacheKeyRegular(params: RegularSearchParams): string {
  return `walz:flights:${JSON.stringify(params)}`
}

function cacheKeyMultiCity(params: MultiCitySearchParams): string {
  return `walz:flights:mc:${JSON.stringify(params)}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ── Multi-city branch ──────────────────────────────────────────────────────
    if (body?.tripType === 'multicity') {
      const parsed = multiCitySearchSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid multi-city parameters', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }

      const params = parsed.data

      // Validate each segment's departure date is in the future and in sequence
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      for (let i = 0; i < params.segments.length; i++) {
        const seg = params.segments[i]
        const depDate = new Date(seg.departureDate)
        if (depDate < today) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: departure date must be in the future` },
            { status: 400 }
          )
        }
        if (i > 0) {
          const prevDate = new Date(params.segments[i - 1].departureDate)
          if (depDate < prevDate) {
            return NextResponse.json(
              { error: `Leg ${i + 1}: departure date must be after leg ${i}` },
              { status: 400 }
            )
          }
        }
      }

      const key = cacheKeyMultiCity(params)
      const cached = await cacheGet(key)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=480' },
        })
      }

      const results = await searchAllSources({
        tripType: 'multicity',
        segments: params.segments,
        adults: params.adults,
        children: params.children,
        infants: params.infants,
        cabinClass: params.cabinClass,
        directOnly: params.directOnly,
        currency: params.currency,
      })

      await cacheSet(key, results, CACHE_TTL)

      return NextResponse.json(results, {
        headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=480' },
      })
    }

    // ── Regular (oneway / roundtrip) branch ────────────────────────────────────
    const parsed = regularSearchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid search parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const params = parsed.data

    const departureDate = new Date(params.departureDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (departureDate < today) {
      return NextResponse.json(
        { error: 'Departure date must be in the future' },
        { status: 400 }
      )
    }

    if (params.returnDate) {
      const returnDate = new Date(params.returnDate)
      if (returnDate <= departureDate) {
        return NextResponse.json(
          { error: 'Return date must be after departure date' },
          { status: 400 }
        )
      }
    }

    const key = cacheKeyRegular(params)
    const cached = await cacheGet(key)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=480' },
      })
    }

    const results = await searchAllSources(params)

    await cacheSet(key, results, CACHE_TTL)

    return NextResponse.json(results, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=480' },
    })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    console.error('[Flights API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to search flights.' },
    { status: 405 }
  )
}
