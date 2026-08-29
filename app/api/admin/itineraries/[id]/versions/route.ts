import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

function getSupabase() {
  try {
    return { sb: getSupabaseAdmin(), err: null }
  } catch (e) {
    return { sb: null, err: e instanceof Error ? e.message : 'Supabase not configured' }
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const { sb: supabase, err } = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 })
  void err

  const { data, error } = await supabase
    .from('itinerary_versions')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('version_number', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[versions/GET]', error)
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to load versions. Please retry.' }, { status: 500 })
  }

  // Map snake_case DB columns to camelCase expected by the frontend interface
  const versions = (data ?? []).map((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    savedBy: row.saved_by,
    note: row.note,
    createdAt: row.created_at,
    snapshot: row.snapshot,
  }))

  return NextResponse.json({ versions })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { sb: supabase, err } = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 })
  void err

  if (!body.snapshot || typeof body.snapshot !== 'object') {
    return NextResponse.json({ error: 'snapshot (object) is required' }, { status: 400 })
  }

  // Get the current max version_number to auto-increment
  const { data: maxRow, error: maxError } = await supabase
    .from('itinerary_versions')
    .select('version_number')
    .eq('itinerary_id', itinerary_id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxError) {
    console.error('[versions/POST] max query error', maxError)
    if (maxError.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to save version. Please retry.' }, { status: 500 })
  }

  const next_version = (maxRow?.version_number ?? 0) + 1

  const saved_by = session.name || session.email || 'Unknown'

  const { data, error } = await supabase
    .from('itinerary_versions')
    .insert({
      itinerary_id,
      version_number: next_version,
      snapshot: body.snapshot,
      saved_by,
      note: body.note?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[versions/POST]', error)
    return NextResponse.json({ error: 'Unable to save version. Please retry.' }, { status: 500 })
  }

  return NextResponse.json({ version: data }, { status: 201 })
}
