import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { OptionItem, OptionSourceType } from '@/lib/v2/types'

export const dynamic = 'force-dynamic'

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_SOURCE_TYPES: readonly OptionSourceType[] = [
  'MANUAL', 'FLIGHT_BOOKING', 'HOTEL_BOOKING', 'TRANSFER_BOOKING', 'TOUR_BOOKING',
]

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapItem(row: Record<string, unknown>): OptionItem {
  return {
    id:               row.id as string,
    groupId:          row.group_id as string,
    itineraryId:      row.itinerary_id as string,
    name:             row.name as string,
    description:      row.description != null ? (row.description as string) : undefined,
    clientPrice:      Number(row.client_price),
    currency:         row.currency as string,
    priceAdjustment:  Number(row.price_adjustment),
    recommended:      row.recommended as boolean,
    defaultSelected:  row.default_selected as boolean,
    clientSelectable: row.client_selectable as boolean,
    active:           row.active as boolean,
    sortOrder:        row.sort_order as number,
    imageUrl:         row.image_url != null ? (row.image_url as string) : undefined,
    quoteExpiresAt:   row.quote_expires_at != null ? (row.quote_expires_at as string) : undefined,
    supplierCost:     row.supplier_cost != null ? Number(row.supplier_cost) : null,
    internalMargin:   row.internal_margin != null ? Number(row.internal_margin) : null,
    sourceType:       row.source_type != null ? (row.source_type as OptionSourceType) : null,
    sourceBookingRef: row.source_booking_ref != null ? (row.source_booking_ref as string) : null,
    metadata:         row.metadata != null ? (row.metadata as Record<string, unknown>) : null,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
  }
}

// ─── Supabase helper ─────────────────────────────────────────────────────────

function getSupabase() {
  try {
    return { sb: getSupabaseAdmin(), err: null }
  } catch (e) {
    return { sb: null, err: e instanceof Error ? e.message : 'Supabase not configured' }
  }
}

type Params = { params: Promise<{ id: string; groupId: string; itemId: string }> }

// ─── PATCH /api/admin/itineraries/[id]/option-groups/[groupId]/items/[itemId] ─

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId, itemId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify item belongs to group belongs to itinerary
  const { data: existingItem, error: fetchError } = await sb
    .from('itinerary_option_items')
    .select('id')
    .eq('id', itemId)
    .eq('group_id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (fetchError || !existingItem) {
    return NextResponse.json(
      { error: 'Option item not found or does not belong to this group/itinerary' },
      { status: 404 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('name' in body) {
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    updates.name = body.name
  }
  if ('description' in body)        updates.description       = body.description ?? null
  if ('clientPrice' in body) {
    const n = Number(body.clientPrice)
    if (isNaN(n)) {
      return NextResponse.json({ error: 'clientPrice must be a number' }, { status: 400 })
    }
    updates.client_price = n
  }
  if ('currency' in body)           updates.currency          = body.currency
  if ('priceAdjustment' in body)    updates.price_adjustment  = Number(body.priceAdjustment)
  if ('recommended' in body)        updates.recommended       = body.recommended
  if ('defaultSelected' in body)    updates.default_selected  = body.defaultSelected
  if ('clientSelectable' in body)   updates.client_selectable = body.clientSelectable
  if ('active' in body)             updates.active            = body.active
  if ('sortOrder' in body)          updates.sort_order        = body.sortOrder
  if ('imageUrl' in body)           updates.image_url         = body.imageUrl ?? null
  if ('quoteExpiresAt' in body)     updates.quote_expires_at  = body.quoteExpiresAt ?? null
  if ('supplierCost' in body) {
    updates.supplier_cost = body.supplierCost != null ? Number(body.supplierCost) : null
  }
  if ('internalMargin' in body) {
    updates.internal_margin = body.internalMargin != null ? Number(body.internalMargin) : null
  }
  if ('sourceType' in body) {
    if (body.sourceType !== null && body.sourceType !== undefined) {
      if (!VALID_SOURCE_TYPES.includes(body.sourceType as OptionSourceType)) {
        return NextResponse.json(
          { error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
          { status: 400 }
        )
      }
    }
    updates.source_type = body.sourceType ?? null
  }
  if ('sourceBookingRef' in body)   updates.source_booking_ref = body.sourceBookingRef ?? null
  if ('metadata' in body)           updates.metadata           = body.metadata ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('itinerary_option_items')
    .update(updates)
    .eq('id', itemId)
    .eq('group_id', groupId)
    .eq('itinerary_id', id)
    .select()
    .single()

  if (error) {
    console.error('[items/[itemId]/PATCH] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: mapItem(data as Record<string, unknown>) })
}

// ─── DELETE /api/admin/itineraries/[id]/option-groups/[groupId]/items/[itemId] ─

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId, itemId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify ownership chain: item → group → itinerary
  const { data: existingItem, error: fetchError } = await sb
    .from('itinerary_option_items')
    .select('id')
    .eq('id', itemId)
    .eq('group_id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (fetchError || !existingItem) {
    return NextResponse.json(
      { error: 'Option item not found or does not belong to this group/itinerary' },
      { status: 404 }
    )
  }

  const { error: deleteError } = await sb
    .from('itinerary_option_items')
    .delete()
    .eq('id', itemId)
    .eq('group_id', groupId)
    .eq('itinerary_id', id)

  if (deleteError) {
    console.error('[items/[itemId]/DELETE] delete error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
