import { NextRequest, NextResponse } from 'next/server'
import { duffelGet } from '@/lib/duffel/client'

/**
 * GET /api/flights/offer-requests/{id}
 * Retrieves a single offer request, including all returned offers.
 *
 * Duffel: GET /air/offer_requests/{id}
 */

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  try {
    const result = await duffelGet<DuffelOfferRequestResponse>(`/air/offer_requests/${id}`)
    return NextResponse.json(result.data)
  } catch (err) {
    console.error('[OfferRequests/Get] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get offer request' },
      { status: 502 }
    )
  }
}
