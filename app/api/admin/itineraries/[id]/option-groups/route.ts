import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type {
  OptionGroup,
  OptionItem,
  OptionCategory,
  SelectionMode,
  PricingMode,
  OptionSourceType,
} from '@/lib/v2/types'

export const dynamic = 'force-dynamic'

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: readonly OptionCategory[] = [
  'FLIGHT', 'HOTEL', 'ROOM', 'TRANSFER', 'ACTIVITY', 'INSURANCE', 'ADDON', 'OTHER',
]
const VALID_SELECTION_MODES: readonly SelectionMode[] = ['SINGLE', 'MULTIPLE']
const VALID_PRICING_MODES: readonly PricingMode[] = ['REPLACEMENT', 'ADD_ON']

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapGroup(row: Record<string, unknown>): OptionGroup {
  return {
    id:                    row.id as string,
    itineraryId:           row.itinerary_id as string,
    name:                  row.name as string,
    description:           row.description != null ? (row.description as string) : undefined,
    category:              row.category as OptionCategory,
    selectionMode:         row.selection_mode as SelectionMode,
    pricingMode:           row.pricing_mode as PricingMode,
    required:              row.required as boolean,
    minSelections:         row.min_selections as number,
    maxSelections:         row.max_selections as number,
    sortOrder:             row.sort_order as number,
    active:                row.active as boolean,
    clientVisible:         row.client_visible as boolean,
    lockedAfterAcceptance: row.locked_after_acceptance as boolean,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  }
}

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

// ─── Admin OptionGroup (groups include nested items for admin workspace) ──────

type AdminOptionGroup = OptionGroup & { items: OptionItem[] }

// ─── GET /api/admin/itineraries/[id]/option-groups ───────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  const { data: groupRows, error: groupsError } = await sb
    .from('itinerary_option_groups')
    .select('*')
    .eq('itinerary_id', id)
    .order('sort_order', { ascending: true })

  if (groupsError) {
    console.error('[option-groups/GET] groups error:', groupsError)
    return NextResponse.json({ error: groupsError.message }, { status: 500 })
  }

  // Fetch all items for this itinerary in one query, then nest into groups
  const { data: itemRows, error: itemsError } = await sb
    .from('itinerary_option_items')
    .select('*')
    .eq('itinerary_id', id)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    console.error('[option-groups/GET] items error:', itemsError)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const items = (itemRows ?? []).map((r) => mapItem(r as Record<string, unknown>))
  const itemsByGroup: Record<string, OptionItem[]> = {}
  for (const item of items) {
    if (!itemsByGroup[item.groupId]) itemsByGroup[item.groupId] = []
    itemsByGroup[item.groupId].push(item)
  }

  const groups: AdminOptionGroup[] = (groupRows ?? []).map((g) => ({
    ...mapGroup(g as Record<string, unknown>),
    items: itemsByGroup[g.id as string] ?? [],
  }))

  return NextResponse.json({ groups })
}

// ─── POST /api/admin/itineraries/[id]/option-groups ──────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, description, category, selectionMode, pricingMode,
          required, minSelections, maxSelections, sortOrder,
          active, clientVisible, lockedAfterAcceptance } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required and must be a string' }, { status: 400 })
  }
  if (!category || !VALID_CATEGORIES.includes(category as OptionCategory)) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!selectionMode || !VALID_SELECTION_MODES.includes(selectionMode as SelectionMode)) {
    return NextResponse.json(
      { error: `selectionMode must be one of: ${VALID_SELECTION_MODES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!pricingMode || !VALID_PRICING_MODES.includes(pricingMode as PricingMode)) {
    return NextResponse.json(
      { error: `pricingMode must be one of: ${VALID_PRICING_MODES.join(', ')}` },
      { status: 400 }
    )
  }

  const insertData: Record<string, unknown> = {
    itinerary_id:            id,
    name:                    name as string,
    category:                category as string,
    selection_mode:          selectionMode as string,
    pricing_mode:            pricingMode as string,
    required:                typeof required === 'boolean' ? required : false,
    min_selections:          typeof minSelections === 'number' ? minSelections : 0,
    max_selections:          typeof maxSelections === 'number' ? maxSelections : 1,
    sort_order:              typeof sortOrder === 'number' ? sortOrder : 0,
    active:                  typeof active === 'boolean' ? active : true,
    client_visible:          typeof clientVisible === 'boolean' ? clientVisible : true,
    locked_after_acceptance: typeof lockedAfterAcceptance === 'boolean' ? lockedAfterAcceptance : false,
  }
  if (description !== undefined) insertData.description = description

  const { data, error } = await sb
    .from('itinerary_option_groups')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[option-groups/POST] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { group: mapGroup(data as Record<string, unknown>) },
    { status: 201 }
  )
}
