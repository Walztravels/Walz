import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchHotels } from '@/lib/sabre/hotels'
import { SabreError } from '@/lib/sabre/auth'

const hotelSearchSchema = z.object({
  destination: z.string().min(2, 'Destination is required').max(10),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-in date'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-out date'),
  rooms: z.number().int().min(1).max(10).default(1),
  adults: z.number().int().min(1).max(20).default(2),
  children: z.number().int().min(0).max(10).default(0),
  currency: z.string().length(3).default('GBP'),
  maxResults: z.number().int().min(1).max(50).default(20),
  starRating: z.array(z.number().int().min(1).max(5)).optional(),
  hotelChains: z.array(z.string().max(10)).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = hotelSearchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid search parameters',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const params = parsed.data

    // Validate check-in is in the future
    const checkInDate = new Date(params.checkIn)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (checkInDate < today) {
      return NextResponse.json(
        { error: 'Check-in date must be in the future' },
        { status: 400 }
      )
    }

    // Validate check-out is after check-in
    const checkOutDate = new Date(params.checkOut)
    if (checkOutDate <= checkInDate) {
      return NextResponse.json(
        { error: 'Check-out date must be after check-in date' },
        { status: 400 }
      )
    }

    // Maximum stay of 30 nights
    const nights = Math.floor(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (nights > 30) {
      return NextResponse.json(
        { error: 'Maximum stay is 30 nights. Please adjust your dates.' },
        { status: 400 }
      )
    }

    const results = await searchHotels(params)

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    if (error instanceof SabreError) {
      console.error('[Hotels API] Sabre error:', error.message, error.statusCode)
      return NextResponse.json(
        {
          error: 'Hotel search service unavailable. Please try again.',
          code: error.sabreCode,
        },
        { status: error.statusCode === 401 ? 503 : 502 }
      )
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    console.error('[Hotels API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to search hotels.' },
    { status: 405 }
  )
}
