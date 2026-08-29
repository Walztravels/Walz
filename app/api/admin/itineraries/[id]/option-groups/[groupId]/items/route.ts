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

type Params = { params: Promise<{ id: string; groupId: string }> }

// ─── GET /api/admin/itineraries/[id]/option-groups/[groupId]/items ───────────

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify group belongs to itinerary
  const { data: group, error: groupError } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (groupError || !group) {
    return NextResponse.json(
      { error: 'Option group not found or does not belong to this itinerary' },
      { status: 404 }
    )
  }

  const { data: itemRows, error: itemsError } = await sb
    .from('itinerary_option_items')
    .select('*')
    .eq('group_id', groupId)
    .eq('itinerary_id', id)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    console.error('[items/GET] items error:', itemsError)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const items = (itemRows ?? []).map((r) => mapItem(r as Record<string, unknown>))
  return NextResponse.json({ items })
}

// ─── POST /api/admin/itineraries/[id]/option-groups/[groupId]/items ──────────

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify group belongs to itinerary
  const { data: group, error: groupError } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (groupError || !group) {
    return NextResponse.json(
      { error: 'Option group not found or does not belong to this itinerary' },
      { status: 404 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    name, description, clientPrice, currency, priceAdjustment,
    recommended, defaultSelected, clientSelectable, active, sortOrder,
    imageUrl, quoteExpiresAt, supplierCost, internalMargin,
    sourceType, sourceBookingRef, metadata,
  } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 })
  }
  if (clientPrice === undefined || clientPrice === null || isNaN(Number(clientPrice))) {
    return NextResponse.json({ error: 'clientPrice is required and must be a number' }, { status: 400 })
  }
  if (!currency || typeof currency !== 'string') {
    return NextResponse.json({ error: 'currency is required and must be a string' }, { status: 400 })
  }
  if (sourceType !== undefined && sourceType !== null) {
    if (!VALID_SOURCE_TYPES.includes(sourceType as OptionSourceType)) {
      return NextResponse.json(
        { error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  const insertData: Record<string, unknown> = {
    group_id:         groupId,
    itinerary_id:     id,
    name:             name as string,
    client_price:     Number(clientPrice),
    currency:         currency as string,
    price_adjustment: priceAdjustment !== undefined ? Number(priceAdjustment) : 0,
    recommended:      typeof recommended === 'boolean' ? recommended : false,
    default_selected: typeof defaultSelected === 'boolean' ? defaultSelected : false,
    client_selectable: typeof clientSelectable === 'boolean' ? clientSelectable : true,
    active:           typeof active === 'boolean' ? active : true,
    sort_order:       typeof sortOrder === 'number' ? sortOrder : 0,
  }

  if (description !== undefined)     insertData.description      = description
  if (imageUrl !== undefined)        insertData.image_url        = imageUrl
  if (quoteExpiresAt !== undefined)  insertData.quote_expires_at = quoteExpiresAt
  if (supplierCost !== undefined)    insertData.supplier_cost    = supplierCost !== null ? Number(supplierCost) : null
  if (internalMargin !== undefined)  insertData.internal_margin  = internalMargin !== null ? Number(internalMargin) : null
  if (sourceType !== undefined)      insertData.source_type      = sourceType
  if (sourceBookingRef !== undefined) insertData.source_booking_ref = sourceBookingRef
  if (metadata !== undefined)        insertData.metadata         = metadata

  const { data, error } = await sb
    .from('itinerary_option_items')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[items/POST] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { item: mapItem(data as Record<string, unknown>) },
    { status: 201 }
  )
}
