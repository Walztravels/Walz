import { NextRequest, NextResponse } from 'next/server'
import { duffelGet } from '@/lib/duffel/client'

interface DuffelConditionRule {
  allowed: boolean
  penalty_amount: string | null
  penalty_currency: string | null
}

interface DuffelOrderResponse {
  data: {
    id: string
    booking_reference: string
    total_amount: string
    total_currency: string
    base_amount: string
    base_currency: string
    tax_amount?: string
    tax_currency?: string
    /** Actions currently available: "cancel" | "change" */
    available_actions: string[]
    payment_status: {
      awaiting_payment: boolean
      price_guarantee_expires_at?: string | null
      payment_required_by?: string | null
    }
    conditions: {
      refund_before_departure?: DuffelConditionRule | null
      change_before_departure?: DuffelConditionRule | null
    }
    documents: { unique_identifier: string; type: string }[]
    passengers: {
      id: string
      given_name: string
      family_name: string
      born_on?: string
      email?: string
      phone_number?: string
      type?: string
      title?: string
      gender?: string
      infant_passenger_id?: string | null
    }[]
    owner?: { name: string; id: string; iata_code: string }
    slices: unknown[]
    services: unknown[]
    live_mode: boolean
    metadata: Record<string, unknown> | null
    cancelled_at: string | null
    created_at: string
    synced_at?: string
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  if (!id?.startsWith('ord_')) {
    return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
  }

  try {
    const result = await duffelGet<DuffelOrderResponse>(`/air/orders/${id}`)
    const o = result.data
    return NextResponse.json({
      id: o.id,
      booking_reference: o.booking_reference,
      total_amount: o.total_amount,
      total_currency: o.total_currency,
      base_amount: o.base_amount,
      base_currency: o.base_currency,
      /** UI: show/hide Cancel and Change buttons based on this array */
      available_actions: o.available_actions,
      can_cancel: o.available_actions.includes('cancel'),
      can_change: o.available_actions.includes('change'),
      payment_status: o.payment_status,
      conditions: o.conditions,
      documents: o.documents,
      passengers: o.passengers,
      slices: o.slices,
      services: o.services,
      owner: o.owner,
      cancelled_at: o.cancelled_at,
      live_mode: o.live_mode,
      created_at: o.created_at,
    })
  } catch (err) {
    console.error('[Orders] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch order' },
      { status: 502 }
    )
  }
}
