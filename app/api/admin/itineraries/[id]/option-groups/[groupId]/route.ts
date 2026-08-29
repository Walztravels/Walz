import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { OptionGroup, OptionCategory, SelectionMode, PricingMode } from '@/lib/v2/types'

export const dynamic = 'force-dynamic'

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_CATEGORIES: readonly OptionCategory[] = [
  'FLIGHT', 'HOTEL', 'ROOM', 'TRANSFER', 'ACTIVITY', 'INSURANCE', 'ADDON', 'OTHER',
]
const VALID_SELECTION_MODES: readonly SelectionMode[] = ['SINGLE', 'MULTIPLE']
const VALID_PRICING_MODES: readonly PricingMode[] = ['REPLACEMENT', 'ADD_ON']

// ─── Mapper ──────────────────────────────────────────────────────────────────

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

// ─── Supabase helper ─────────────────────────────────────────────────────────

function getSupabase() {
  try {
    return { sb: getSupabaseAdmin(), err: null }
  } catch (e) {
    return { sb: null, err: e instanceof Error ? e.message : 'Supabase not configured' }
  }
}

type Params = { params: Promise<{ id: string; groupId: string }> }

// ─── PATCH /api/admin/itineraries/[id]/option-groups/[groupId] ───────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify group belongs to itinerary
  const { data: existing, error: fetchError } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (fetchError || !existing) {
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

  const updates: Record<string, unknown> = {}

  if ('name' in body) {
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    updates.name = body.name
  }
  if ('description' in body) {
    updates.description = body.description ?? null
  }
  if ('category' in body) {
    if (!VALID_CATEGORIES.includes(body.category as OptionCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }
    updates.category = body.category
  }
  if ('selectionMode' in body) {
    if (!VALID_SELECTION_MODES.includes(body.selectionMode as SelectionMode)) {
      return NextResponse.json(
        { error: `selectionMode must be one of: ${VALID_SELECTION_MODES.join(', ')}` },
        { status: 400 }
      )
    }
    updates.selection_mode = body.selectionMode
  }
  if ('pricingMode' in body) {
    if (!VALID_PRICING_MODES.includes(body.pricingMode as PricingMode)) {
      return NextResponse.json(
        { error: `pricingMode must be one of: ${VALID_PRICING_MODES.join(', ')}` },
        { status: 400 }
      )
    }
    updates.pricing_mode = body.pricingMode
  }
  if ('required' in body)              updates.required              = body.required
  if ('minSelections' in body)         updates.min_selections        = body.minSelections
  if ('maxSelections' in body)         updates.max_selections        = body.maxSelections
  if ('sortOrder' in body)             updates.sort_order            = body.sortOrder
  if ('active' in body)                updates.active                = body.active
  if ('clientVisible' in body)         updates.client_visible        = body.clientVisible
  if ('lockedAfterAcceptance' in body) updates.locked_after_acceptance = body.lockedAfterAcceptance

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('itinerary_option_groups')
    .update(updates)
    .eq('id', groupId)
    .eq('itinerary_id', id)
    .select()
    .single()

  if (error) {
    console.error('[option-groups/[groupId]/PATCH] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ group: mapGroup(data as Record<string, unknown>) })
}

// ─── DELETE /api/admin/itineraries/[id]/option-groups/[groupId] ──────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, groupId } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  // Verify group belongs to itinerary
  const { data: existing, error: fetchError } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('id', groupId)
    .eq('itinerary_id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: 'Option group not found or does not belong to this itinerary' },
      { status: 404 }
    )
  }

  // Soft check: reject if any item is defaultSelected or recommended
  const { data: blockedItems, error: checkError } = await sb
    .from('itinerary_option_items')
    .select('id')
    .eq('group_id', groupId)
    .or('default_selected.eq.true,recommended.eq.true')
    .limit(1)

  if (checkError) {
    console.error('[option-groups/[groupId]/DELETE] check error:', checkError)
    return NextResponse.json({ error: checkError.message }, { status: 500 })
  }

  if (blockedItems && blockedItems.length > 0) {
    return NextResponse.json(
      { error: 'Group has recommended or default items — remove those first' },
      { status: 400 }
    )
  }

  const { error: deleteError } = await sb
    .from('itinerary_option_groups')
    .delete()
    .eq('id', groupId)
    .eq('itinerary_id', id)

  if (deleteError) {
    console.error('[option-groups/[groupId]/DELETE] delete error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
