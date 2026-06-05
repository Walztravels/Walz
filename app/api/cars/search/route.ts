import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost } from '@/lib/duffel/client'

/**
 * POST /api/cars/search
 * Searches for car hire options via Duffel Cars.
 *
 * POST /air/cars/search
 * Returns a list of car search results (rates) with supplier, vehicle, and pricing details.
 */

const coordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
})

const locationSchema = z.object({
  radius: z.number().int().min(1).max(50).default(1),
  geographic_coordinates: coordinatesSchema,
})

const bodySchema = z.object({
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/),
  dropoff_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dropoff_time: z.string().regex(/^\d{2}:\d{2}$/),
  pickup_location: locationSchema,
  dropoff_location: locationSchema,
  driver: z.object({
    age: z.number().int().min(18).max(99),
    residence_country_code: z.string().length(2),
  }),
})

interface DuffelCarSearchResponse {
  data: {
    id: string
    results: DuffelCarResult[]
  }
}

interface DuffelCarResult {
  id: string
  rate_id: string
  supplier: { name: string; iata_code?: string }
  vehicle: {
    name: string
    type: string
    doors?: number
    seats?: number
    transmission?: string
    air_conditioning?: boolean
    image_url?: string
  }
  pickup_location: { name: string; iata_code?: string; address?: unknown }
  dropoff_location: { name: string; iata_code?: string; address?: unknown }
  pickup_date: string
  pickup_time: string
  dropoff_date: string
  dropoff_time: string
  base_amount: string
  base_currency: string
  tax_amount?: string
  tax_currency?: string
  total_amount: string
  total_currency: string
  rate_category?: string
  fuel_policy?: string
  mileage?: { unit?: string; value?: number | null; unlimited?: boolean }
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
    const result = await duffelPost<DuffelCarSearchResponse>('/cars/search', {
      data: parsed.data,
    })

    return NextResponse.json({
      search_id: result.data.id,
      results: result.data.results,
    })
  } catch (err) {
    console.error('[Cars/Search] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Car search failed' },
      { status: 502 }
    )
  }
}
