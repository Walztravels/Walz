import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelGet, duffelPost } from '@/lib/duffel/client'

/**
 * GET  /api/flights/offer-requests          — list offer requests (paginated)
 * POST /api/flights/offer-requests          — create an offer request
 *
 * Duffel:
 *   GET  /air/offer_requests?after=&before=&limit=
 *   POST /air/offer_requests?return_offers=true&supplier_timeout=10000
 */

// ─── POST schema ─────────────────────────────────────────────────────────────

const timeWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
})

const sliceSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_time: timeWindowSchema.optional(),
  arrival_time: timeWindowSchema.optional(),
})

const passengerSchema = z.object({
  type: z.enum(['adult', 'child', 'infant_without_seat']).optional(),
  age: z.number().int().optional(),
  fare_type: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  loyalty_programme_accounts: z
    .array(z.object({ airline_iata_code: z.string(), account_number: z.string() }))
    .optional(),
})

const privateFareSchema = z.array(
  z.object({
    corporate_code: z.string().optional(),
    tracking_reference: z.string().optional(),
    tour_code: z.string().optional(),
  })
)

const createBodySchema = z.object({
  slices: z.array(sliceSchema).min(1).max(6),
  passengers: z.array(passengerSchema).min(1),
  cabin_class: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
  max_connections: z.number().int().min(0).optional(),
  /** Corporate/negotiated fares keyed by airline IATA code */
  private_fares: z.record(z.string(), privateFareSchema).optional(),
  /** Airline credit IDs to apply (acd_...) */
  airline_credit_ids: z.array(z.string()).optional(),
  /** When true, return offers inline; when false, poll /air/offer_requests/{id} */
  return_offers: z.boolean().optional(),
  supplier_timeout: z.number().int().min(1000).max(60000).optional(),
})

// ─── Duffel response types ────────────────────────────────────────────────────

interface DuffelOfferRequestListResponse {
  meta: { limit: number; after?: string | null; before?: string | null }
  data: unknown[]
}

interface DuffelOfferRequestResponse {
  data: {
    id: string
    client_key: string
    cabin_class?: string
    live_mode: boolean
    created_at: string
    slices: unknown[]
    passengers: unknown[]
    offers?: unknown[]
    airline_credit_ids?: string[]
  }
}

// ─── GET — list offer requests ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const after = searchParams.get('after') ?? undefined
  const before = searchParams.get('before') ?? undefined
  const limit = searchParams.get('limit') ?? undefined

  const query: Record<string, string> = {}
  if (after) query.after = after
  if (before) query.before = before
  if (limit) query.limit = limit

  try {
    const result = await duffelGet<DuffelOfferRequestListResponse>(
      '/air/offer_requests',
      query
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[OfferRequests/List] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list offer requests' },
      { status: 502 }
    )
  }
}

// ─── POST — create offer request ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = createBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { return_offers = true, supplier_timeout = 10000, ...offerRequestData } = parsed.data

  try {
    const result = await duffelPost<DuffelOfferRequestResponse>(
      '/air/offer_requests',
      { data: offerRequestData },
      { return_offers: String(return_offers), supplier_timeout: String(supplier_timeout) }
    )

    return NextResponse.json(result.data)
  } catch (err) {
    console.error('[OfferRequests/Create] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create offer request' },
      { status: 502 }
    )
  }
}
