import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/stays/quote
 * Creates a stays quote from a rate_id.
 * Quote locks in the price and cancellation policy before booking.
 *
 * Duffel: POST /stays/quotes { data: { rate_id } }
 */

const bodySchema = z.object({
  rate_id: z.string().min(1),
})

interface DuffelStaysQuoteResponse {
  data: {
    id: string
    rate_id?: string
    accommodation?: unknown
    room_rate?: unknown
    check_in_date?: string
    check_out_date?: string
    rooms?: number
    guests?: unknown[]
    total_amount?: string
    total_currency?: string
    tax_amount?: string
    tax_currency?: string
    cancellation_timeline?: unknown[]
    cancellation_deadline?: string | null
    expires_at?: string
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
    const result = await duffelPost<DuffelStaysQuoteResponse>('/stays/quotes', {
      data: { rate_id: parsed.data.rate_id },
    })

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('[Stays/Quote] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stays quote failed' },
      { status: 502 }
    )
  }
}
