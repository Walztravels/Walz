import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('itinerary_versions')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('version_number', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[versions/GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ versions: data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const supabase = getSupabaseAdmin()

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
    return NextResponse.json({ error: maxError.message }, { status: 500 })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ version: data }, { status: 201 })
}
