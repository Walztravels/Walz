import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/stays/book
 * Books accommodation using a quote_id from /api/stays/quote.
 *
 * Duffel: POST /stays/bookings
 */

const guestSchema = z.object({
  given_name: z.string().min(1),
  family_name: z.string().min(1),
  born_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const bodySchema = z.object({
  quote_id: z.string().min(1),
  email: z.string().email(),
  phone_number: z.string().min(5),
  guests: z.array(guestSchema).min(1),
  accommodation_special_requests: z.string().optional(),
})

interface DuffelStaysBookingResponse {
  data: {
    id: string
    booking_reference?: string
    quote_id?: string
    accommodation?: unknown
    room_rate?: unknown
    check_in_date?: string
    check_out_date?: string
    rooms?: number
    guests?: unknown[]
    email?: string
    phone_number?: string
    total_amount?: string
    total_currency?: string
    cancellation_deadline?: string | null
    accommodation_special_requests?: string | null
    status?: string
    created_at: string
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const result = await duffelPost<DuffelStaysBookingResponse>('/stays/bookings', {
      data: parsed.data,
    })

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('[Stays/Book] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stays booking failed' },
      { status: 502 }
    )
  }
}
