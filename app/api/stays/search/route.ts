import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost, duffelGet } from '@/lib/duffel/client'

/**
 * POST /api/stays/search  — search for accommodation
 * POST /api/stays/rates   — fetch all rates for a search result (action: "rates")
 *
 * Duffel Stays:
 *   POST /stays/search         → search_result_id + initial results
 *   GET  /stays/search_results/{id}/rates → all room rates for a property
 */

const guestsSchema = z.array(
  z.object({ type: z.enum(['adult', 'child']), age: z.number().int().optional() })
).min(1)

const dateFields = {
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.number().int().min(1).max(8).default(1),
  guests: guestsSchema,
}

const bodySchema = z.discriminatedUnion('action', [
  // Location-based search
  z.object({
    action: z.literal('search'),
    ...dateFields,
    location: z.object({
      radius: z.number().min(1).max(50).default(2),
      geographic_coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
    }),
  }),
  // Accommodation ID search — optionally fetch rates inline
  z.object({
    action: z.literal('search_by_id'),
    ...dateFields,
    accommodation: z.object({
      ids: z.array(z.string()).min(1),
      fetch_rates: z.boolean().optional(),
    }),
  }),
  // Fetch all rates for a specific search result
  z.object({
    action: z.literal('rates'),
    search_result_id: z.string().min(1),
  }),
])

interface DuffelStaysSearchResponse {
  data: {
    id: string
    results: unknown[]
  }
}

interface DuffelStaysRatesResponse {
  data: unknown[]
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
    if (parsed.data.action === 'search' || parsed.data.action === 'search_by_id') {
      const { action: _, ...searchData } = parsed.data
      const result = await duffelPost<DuffelStaysSearchResponse>('/stays/search', {
        data: searchData,
      })
      return NextResponse.json({ search_id: result.data.id, results: result.data.results })
    }

    // action === 'rates'
    const result = await duffelGet<DuffelStaysRatesResponse>(
      `/stays/search_results/${parsed.data.search_result_id}/rates`
    )
    return NextResponse.json({ rates: result.data })
  } catch (err) {
    console.error('[Stays/Search] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stays search failed' },
      { status: 502 }
    )
  }
}
