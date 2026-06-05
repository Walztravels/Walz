import { NextRequest, NextResponse } from 'next/server'
import { duffelGet } from '@/lib/duffel/client'

/**
 * GET /api/flights/airline-initiated-changes?order_id={id}
 * Lists airline-initiated changes for a given order.
 * In the test environment, each call creates a new simulated change
 * (use LHR→LTN route to trigger this).
 *
 * Duffel: GET /air/airline_initiated_changes?order_id={id}
 */

interface DuffelAirlineInitiatedChange {
  id: string
  order_id: string
  created_at: string
  updated_at: string
  action_taken_at: string | null
  action_taken: string | null
  expires_at: string | null
  slices: {
    added: unknown[]
    removed: unknown[]
  }
  conditions: unknown
}

interface DuffelAirlineInitiatedChangesResponse {
  data: DuffelAirlineInitiatedChange[]
  meta?: { limit: number; after?: string | null; before?: string | null }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const order_id = searchParams.get('order_id')

  if (!order_id) {
    return NextResponse.json(
      { error: 'order_id query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const result = await duffelGet<DuffelAirlineInitiatedChangesResponse>(
      '/air/airline_initiated_changes',
      { order_id }
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[AirlineInitiatedChanges] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list airline-initiated changes' },
      { status: 502 }
    )
  }
}
