import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// ─── Airalo helpers ──────────────────────────────────────────────────────────

async function getAiraloToken(): Promise<string | null> {
  const clientId = process.env.AIRALO_CLIENT_ID
  const clientSecret = process.env.AIRALO_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch('https://sandbox-partners-api.airalo.com/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.access_token ?? json?.access_token ?? null
  } catch {
    return null
  }
}

async function getAiraloRecommendations(
  token: string,
  destination: string,
): Promise<unknown[]> {
  try {
    const url = new URL('https://sandbox-partners-api.airalo.com/v2/packages')
    url.searchParams.set('type', 'local')
    url.searchParams.set('limit', '5')
    if (destination) url.searchParams.set('destination', destination)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.data) ? json.data : []
  } catch {
    return []
  }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ esims: [], recommendations: [], _warning: 'Supabase not configured' })
  }

  // 1. Fetch assigned eSIMs
  const { data: esims, error } = await supabase
    .from('itinerary_esims')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[esim/GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. Airalo recommendations (best-effort, graceful fallback)
  const { searchParams } = new URL(req.url)
  const destination = searchParams.get('destination') ?? ''

  let recommendations: unknown[] = []
  try {
    const token = await getAiraloToken()
    if (token) {
      recommendations = await getAiraloRecommendations(token, destination)
    }
  } catch {
    // silently ignore — recommendations stays []
  }

  return NextResponse.json({ esims: esims ?? [], recommendations })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try { supabase = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('itinerary_esims')
    .insert({
      itinerary_id,
      traveler_name: body.traveler_name?.trim() || null,
      package_code: body.package_code?.trim() || null,
      package_name: body.package_name?.trim() || null,
      provider: body.provider?.trim() || 'airalo',
      destination_countries: body.destination_countries || [],
      data_amount: body.data_amount?.trim() || null,
      validity_days: body.validity_days ? Number(body.validity_days) : null,
      wholesale_cost: body.wholesale_cost ? Number(body.wholesale_cost) : null,
      client_price: body.client_price ? Number(body.client_price) : null,
      currency: body.currency?.trim() || 'USD',
      status: body.status || 'recommended',
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[esim/POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ esim: data }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { esimId, ...rest } = body

  if (!esimId) {
    return NextResponse.json({ error: 'esimId is required' }, { status: 400 })
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try { supabase = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const allowed = [
    'traveler_name', 'package_code', 'package_name', 'provider',
    'destination_countries', 'data_amount', 'validity_days',
    'wholesale_cost', 'client_price', 'currency', 'status', 'notes',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in rest) {
      if (['validity_days'].includes(key)) {
        updates[key] = rest[key] !== null ? Number(rest[key]) : null
      } else if (['wholesale_cost', 'client_price'].includes(key)) {
        updates[key] = rest[key] !== null ? Number(rest[key]) : null
      } else {
        updates[key] = rest[key]
      }
    }
  }

  const { data, error } = await supabase
    .from('itinerary_esims')
    .update(updates)
    .eq('id', esimId)
    .eq('itinerary_id', itinerary_id)
    .select()
    .single()

  if (error) {
    console.error('[esim/PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ esim: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json()
  const { esimId } = body

  if (!esimId) {
    return NextResponse.json({ error: 'esimId is required' }, { status: 400 })
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try { supabase = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { error } = await supabase
    .from('itinerary_esims')
    .delete()
    .eq('id', esimId)
    .eq('itinerary_id', itinerary_id)

  if (error) {
    console.error('[esim/DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
