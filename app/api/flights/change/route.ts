import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { duffelPost, duffelGet } from '@/lib/duffel/client'

/**
 * Order change — five-step Duffel flow:
 *
 * Step 1 — action: "create_request"
 *   POST /air/order_change_requests { order_id, slices: { remove, add } }
 *   → { change_request_id: "ocr_..." }
 *
 * Step 2 — action: "get_request"
 *   GET /air/order_change_requests/{change_request_id}
 *   → { change_offers: [{ id: "oco_...", change_total_amount, penalty_total_amount, ... }] }
 *   Show these to the user so they can pick which offer to accept.
 *
 * Step 3 — action: "create_change"
 *   POST /air/order_changes { selected_order_change_offer: "oco_..." }
 *   → { order_change_id: "oce_...", confirmed_at: null }
 *
 * Step 4 — action: "get_change"
 *   GET /air/order_changes/{order_change_id}
 *   → order change details (confirmed_at: null until step 5)
 *
 * Step 5 — action: "confirm_change"
 *   POST /air/order_changes/{order_change_id}/actions/confirm
 *   Body: { payment: { type, currency, amount } }
 *   → confirmed_at is now set; change applied to order
 */

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sliceToAddSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cabin_class: z.enum(['economy', 'premium_economy', 'business', 'first']),
})

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_request'),
    order_id: z.string().min(1),
    slices: z.object({
      remove: z.array(z.object({ slice_id: z.string().min(1) })).optional(),
      add: z.array(sliceToAddSchema).optional(),
    }),
  }),
  z.object({
    action: z.literal('get_request'),
    change_request_id: z.string().min(1),
  }),
  z.object({
    action: z.literal('create_change'),
    change_offer_id: z.string().min(1),
  }),
  z.object({
    action: z.literal('get_change'),
    order_change_id: z.string().min(1),
  }),
  z.object({
    action: z.literal('confirm_change'),
    order_change_id: z.string().min(1),
    payment: z.object({
      type: z.enum(['balance', 'arc_bsp_cash']),
      currency: z.string().length(3),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    }),
  }),
])

// ─── Duffel types ─────────────────────────────────────────────────────────────

interface DuffelChangeOffer {
  id: string
  order_change_request_id?: string
  change_total_amount: string
  change_total_currency: string
  new_total_amount: string
  new_total_currency: string
  penalty_total_amount: string
  penalty_total_currency: string
  refund_to?: string
  expires_at: string
  confirmed_at?: string | null
  created_at: string
  slices: { remove: unknown[]; add: unknown[] }
}

interface DuffelChangeRequestResponse {
  data: {
    id: string
    order_id: string
    slices: { remove: unknown[]; add: unknown[] }
    order_change_offers?: DuffelChangeOffer[]
    created_at: string
    updated_at?: string
    live_mode: boolean
  }
}

interface DuffelOrderChangeResponse {
  data: DuffelChangeOffer & { order_id: string; live_mode: boolean }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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
    const d = parsed.data

    if (d.action === 'create_request') {
      const res = await duffelPost<DuffelChangeRequestResponse>(
        '/air/order_change_requests',
        { data: { order_id: d.order_id, slices: d.slices } }
      )
      return NextResponse.json({ change_request_id: res.data.id, order_id: res.data.order_id })
    }

    if (d.action === 'get_request') {
      const res = await duffelGet<DuffelChangeRequestResponse>(
        `/air/order_change_requests/${d.change_request_id}`
      )
      const offers = (res.data.order_change_offers ?? []).map((o) => ({
        id: o.id,
        change_total_amount: o.change_total_amount,
        change_total_currency: o.change_total_currency,
        new_total_amount: o.new_total_amount,
        new_total_currency: o.new_total_currency,
        penalty_total_amount: o.penalty_total_amount,
        penalty_total_currency: o.penalty_total_currency,
        refund_to: o.refund_to ?? null,
        expires_at: o.expires_at,
        slices: o.slices,
      }))
      return NextResponse.json({ change_request_id: res.data.id, order_id: res.data.order_id, change_offers: offers })
    }

    if (d.action === 'create_change') {
      const res = await duffelPost<DuffelOrderChangeResponse>(
        '/air/order_changes',
        { data: { selected_order_change_offer: d.change_offer_id } }
      )
      const c = res.data
      return NextResponse.json({
        order_change_id: c.id,
        order_id: c.order_id,
        confirmed_at: c.confirmed_at ?? null,
        change_total_amount: c.change_total_amount,
        change_total_currency: c.change_total_currency,
        expires_at: c.expires_at,
      })
    }

    if (d.action === 'get_change') {
      const res = await duffelGet<DuffelOrderChangeResponse>(
        `/air/order_changes/${d.order_change_id}`
      )
      const c = res.data
      return NextResponse.json({
        order_change_id: c.id,
        order_id: c.order_id,
        confirmed_at: c.confirmed_at ?? null,
        change_total_amount: c.change_total_amount,
        change_total_currency: c.change_total_currency,
        penalty_total_amount: c.penalty_total_amount,
        penalty_total_currency: c.penalty_total_currency,
        expires_at: c.expires_at,
        slices: c.slices,
      })
    }

    // action === 'confirm_change'
    const res = await duffelPost<DuffelOrderChangeResponse>(
      `/air/order_changes/${d.order_change_id}/actions/confirm`,
      { data: { payment: d.payment } }
    )
    const c = res.data
    return NextResponse.json({
      changed: true,
      order_change_id: c.id,
      order_id: c.order_id,
      confirmed_at: c.confirmed_at ?? null,
      change_total_amount: c.change_total_amount,
      change_total_currency: c.change_total_currency,
    })
  } catch (err) {
    console.error('[Change] Duffel error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Change request failed' },
      { status: 502 }
    )
  }
}
