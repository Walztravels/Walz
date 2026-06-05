import { NextRequest, NextResponse } from 'next/server'
import { duffelGet } from '@/lib/duffel/client'

/**
 * GET /api/flights/offers/{id}
 *
 * Fetches a Duffel offer by ID. The response includes:
 *  - client_key  — JWT the frontend passes to createThreeDSecureSession()
 *  - total_amount / total_currency — amount to charge
 *  - available_services — bags, seats, etc. the user can add
 *  - payment_requirements.requires_instant_payment — if true, cannot hold
 */

interface DuffelOfferDetail {
  data: {
    id: string
    client_key?: string
    total_amount: string
    total_currency: string
    base_amount: string
    base_currency: string
    tax_amount?: string
    tax_currency?: string
    cabin_class: string
    expires_at: string
    available_services?: {
      id: string
      type: string
      total_amount: string
      total_currency: string
      metadata?: unknown
    }[]
    payment_requirements?: {
      requires_instant_payment: boolean
      price_guarantee_expires_at?: string | null
      payment_required_by?: string | null
    }
    slices: unknown[]
    passengers: { id: string; type?: string; age?: number }[]
    conditions: {
      refund_before_departure?: { allowed: boolean; penalty_amount?: string | null; penalty_currency?: string | null } | null
      change_before_departure?: { allowed: boolean; penalty_amount?: string | null; penalty_currency?: string | null } | null
    }
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  if (!id?.startsWith('off_')) {
    return NextResponse.json({ error: 'Invalid offer ID' }, { status: 400 })
  }

  try {
    const result = await duffelGet<DuffelOfferDetail>(`/air/offers/${id}`)
    const o = result.data

    return NextResponse.json({
      id: o.id,
      client_key: o.client_key ?? null,
      total_amount: o.total_amount,
      total_currency: o.total_currency,
      base_amount: o.base_amount,
      base_currency: o.base_currency,
      tax_amount: o.tax_amount ?? null,
      cabin_class: o.cabin_class,
      expires_at: o.expires_at,
      passengers: o.passengers,
      available_services: o.available_services ?? [],
      requires_instant_payment: o.payment_requirements?.requires_instant_payment ?? false,
      payment_required_by: o.payment_requirements?.payment_required_by ?? null,
      conditions: o.conditions,
    })
  } catch (err) {
    console.error('[Offers] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch offer' },
      { status: 502 }
    )
  }
}
