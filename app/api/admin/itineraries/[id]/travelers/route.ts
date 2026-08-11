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
    .from('itinerary_travelers')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('lead_traveler', { ascending: false })
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[travelers/GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ travelers: data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const supabase = getSupabaseAdmin()

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('itinerary_travelers')
    .insert({
      itinerary_id,
      full_name: body.full_name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      date_of_birth: body.date_of_birth || null,
      nationality: body.nationality?.trim() || null,
      passport_number: body.passport_number?.trim() || null,
      passport_expiry: body.passport_expiry || null,
      passport_country: body.passport_country?.trim() || null,
      lead_traveler: body.lead_traveler === true,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[travelers/POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ traveler: data }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { travelerId, ...rest } = body

  if (!travelerId) {
    return NextResponse.json({ error: 'travelerId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const allowed = [
    'full_name', 'email', 'phone', 'date_of_birth', 'nationality',
    'passport_number', 'passport_expiry', 'passport_country', 'lead_traveler', 'notes',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in rest) updates[key] = rest[key]
  }

  const { data, error } = await supabase
    .from('itinerary_travelers')
    .update(updates)
    .eq('id', travelerId)
    .eq('itinerary_id', itinerary_id)
    .select()
    .single()

  if (error) {
    console.error('[travelers/PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ traveler: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { travelerId } = body

  if (!travelerId) {
    return NextResponse.json({ error: 'travelerId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('itinerary_travelers')
    .delete()
    .eq('id', travelerId)
    .eq('itinerary_id', itinerary_id)

  if (error) {
    console.error('[travelers/DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
