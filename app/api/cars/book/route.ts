import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/cars/book
 * Books a car hire using a quote_id from /api/cars/quote.
 *
 * Duffel: POST /cars/bookings { data: { quote_id, driver: [...] } }
 * → returns booking confirmation with booking_reference and documents
 */

const driverSchema = z.object({
  given_name: z.string().min(1),
  family_name: z.string().min(1),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
  phone_number: z.string().min(5),
})

const bodySchema = z.object({
  quote_id: z.string().min(1),
  driver: z.array(driverSchema).min(1).max(1), // Duffel Cars: one driver per booking
})

interface DuffelCarBookingResponse {
  data: {
    id: string
    booking_reference?: string
    quote_id: string
    total_amount: string
    total_currency: string
    status?: string
    driver: unknown[]
    vehicle?: unknown
    supplier?: unknown
    pickup_location?: unknown
    dropoff_location?: unknown
    pickup_date?: string
    pickup_time?: string
    dropoff_date?: string
    dropoff_time?: string
    documents?: { type: string; url?: string }[]
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
    const result = await duffelPost<DuffelCarBookingResponse>('/cars/bookings', {
      data: {
        quote_id: parsed.data.quote_id,
        driver: parsed.data.driver,
      },
    })

    const b = result.data
    return NextResponse.json({
      booking_id: b.id,
      booking_reference: b.booking_reference ?? null,
      total_amount: b.total_amount,
      total_currency: b.total_currency,
      status: b.status ?? null,
      vehicle: b.vehicle,
      supplier: b.supplier,
      pickup_location: b.pickup_location,
      dropoff_location: b.dropoff_location,
      pickup_date: b.pickup_date,
      pickup_time: b.pickup_time,
      dropoff_date: b.dropoff_date,
      dropoff_time: b.dropoff_time,
      documents: b.documents ?? [],
      created_at: b.created_at,
    })
  } catch (err) {
    console.error('[Cars/Book] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Car booking failed' },
      { status: 502 }
    )
  }
}
