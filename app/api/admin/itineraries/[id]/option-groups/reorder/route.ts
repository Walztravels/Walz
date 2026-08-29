import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ─── Supabase helper ─────────────────────────────────────────────────────────

function getSupabase() {
  try {
    return { sb: getSupabaseAdmin(), err: null }
  } catch (e) {
    return { sb: null, err: e instanceof Error ? e.message : 'Supabase not configured' }
  }
}

// ─── POST /api/admin/itineraries/[id]/option-groups/reorder ──────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { sb, err } = getSupabase()
  if (!sb) return NextResponse.json({ error: err ?? 'Supabase not configured' }, { status: 503 })

  let body: { groups?: Array<{ id: string; sortOrder: number }> }
  try {
    body = (await req.json()) as { groups?: Array<{ id: string; sortOrder: number }> }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return NextResponse.json({ error: 'groups must be a non-empty array' }, { status: 400 })
  }

  // Validate each entry
  for (const entry of body.groups) {
    if (!entry.id || typeof entry.id !== 'string') {
      return NextResponse.json({ error: 'Each group entry must have a valid id string' }, { status: 400 })
    }
    if (typeof entry.sortOrder !== 'number') {
      return NextResponse.json({ error: 'Each group entry must have a numeric sortOrder' }, { status: 400 })
    }
  }

  // Verify all groups belong to this itinerary
  const incomingIds = body.groups.map((g) => g.id)
  const { data: existingGroups, error: fetchError } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('itinerary_id', id)
    .in('id', incomingIds)

  if (fetchError) {
    console.error('[reorder/POST] fetch error:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const foundIds = new Set((existingGroups ?? []).map((g: { id: string }) => g.id as string))
  const missingIds = incomingIds.filter((gid) => !foundIds.has(gid))
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: `Groups not found or not in this itinerary: ${missingIds.join(', ')}` },
      { status: 404 }
    )
  }

  // Batch-update sort orders
  const updateResults = await Promise.all(
    body.groups.map(({ id: groupId, sortOrder }) =>
      sb
        .from('itinerary_option_groups')
        .update({ sort_order: sortOrder })
        .eq('id', groupId)
        .eq('itinerary_id', id)
    )
  )

  const firstError = updateResults.find((r) => r.error)?.error
  if (firstError) {
    console.error('[reorder/POST] update error:', firstError)
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  return NextResponse.json({ updated: body.groups.length })
}
