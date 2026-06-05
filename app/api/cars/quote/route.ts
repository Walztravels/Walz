import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/cars/quote
 * Creates a car hire quote from a rate_id returned by /api/cars/search.
 * A quote locks in the price for a short period before booking.
 *
 * Duffel: POST /cars/quotes { data: { rate_id } }
 * → returns quote_id ("qut_...") + confirmed pricing
 */

const bodySchema = z.object({
  rate_id: z.string().min(1),
})

interface DuffelCarQuoteResponse {
  data: {
    id: string
    rate_id: string
    total_amount: string
    total_currency: string
    base_amount: string
    base_currency: string
    tax_amount?: string
    tax_currency?: string
    expires_at?: string
    vehicle?: unknown
    supplier?: unknown
    pickup_location?: unknown
    dropoff_location?: unknown
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
    const result = await duffelPost<DuffelCarQuoteResponse>('/cars/quotes', {
      data: { rate_id: parsed.data.rate_id },
    })

    const q = result.data
    return NextResponse.json({
      quote_id: q.id,
      rate_id: q.rate_id,
      total_amount: q.total_amount,
      total_currency: q.total_currency,
      base_amount: q.base_amount,
      base_currency: q.base_currency,
      tax_amount: q.tax_amount ?? null,
      tax_currency: q.tax_currency ?? null,
      expires_at: q.expires_at ?? null,
      vehicle: q.vehicle,
      supplier: q.supplier,
      pickup_location: q.pickup_location,
      dropoff_location: q.dropoff_location,
    })
  } catch (err) {
    console.error('[Cars/Quote] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Car quote failed' },
      { status: 502 }
    )
  }
}
