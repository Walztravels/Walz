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
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // 1. Fetch assigned eSIMs
  const { data: esims, error } = await supabase
    .from('itinerary_esims')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[esim/GET]', error)
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration phases4_16_workspace_tables.sql in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to process request. Please retry.' }, { status: 500 })
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

  // Required field
  if (!body.provider?.trim()) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 })
  }

  // Status enum
  const VALID_ESIM_STATUS = ['recommended', 'added', 'purchased', 'issued', 'installed', 'activated']
  const esimStatus = body.status || 'recommended'
  if (!VALID_ESIM_STATUS.includes(esimStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_ESIM_STATUS.join(', ')}` }, { status: 400 })
  }

  // Numeric validation: NaN, Infinity, and negative values are all rejected with 400.
  // Absent/empty fields are accepted as null.
  function validateNumField(v: unknown, fieldName: string, allowNegative = false): { ok: true; value: number | null } | { ok: false; error: string } {
    if (v === null || v === undefined || v === '') return { ok: true, value: null }
    const n = Number(v)
    if (isNaN(n) || !isFinite(n)) return { ok: false, error: `${fieldName} must be a valid finite number` }
    if (!allowNegative && n < 0) return { ok: false, error: `${fieldName} must be >= 0` }
    return { ok: true, value: n }
  }

  const validityResult = validateNumField(body.validity_days, 'validity_days')
  if (!validityResult.ok) return NextResponse.json({ error: validityResult.error }, { status: 400 })

  const wholesaleResult = validateNumField(body.wholesale_cost, 'wholesale_cost')
  if (!wholesaleResult.ok) return NextResponse.json({ error: wholesaleResult.error }, { status: 400 })

  const clientPriceResult = validateNumField(body.client_price, 'client_price')
  if (!clientPriceResult.ok) return NextResponse.json({ error: clientPriceResult.error }, { status: 400 })

  const { data, error } = await supabase
    .from('itinerary_esims')
    .insert({
      itinerary_id,
      traveler_name: body.traveler_name?.trim() || null,
      package_code: body.package_code?.trim() || null,
      package_name: body.package_name?.trim() || null,
      provider: body.provider.trim(),
      destination_countries: body.destination_countries || [],
      data_amount: body.data_amount?.trim() || null,
      validity_days: validityResult.value,
      wholesale_cost: wholesaleResult.value,
      client_price: clientPriceResult.value,
      currency: body.currency?.trim() || 'USD',
      status: esimStatus,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[esim/POST]', error)
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration phases4_16_workspace_tables.sql in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to process request. Please retry.' }, { status: 500 })
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

  // Status enum validation
  const VALID_ESIM_STATUS_PATCH = ['recommended', 'added', 'purchased', 'issued', 'installed', 'activated']
  if ('status' in rest && !VALID_ESIM_STATUS_PATCH.includes(rest.status as string)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_ESIM_STATUS_PATCH.join(', ')}` }, { status: 400 })
  }

  // Numeric validation for PATCH: NaN, Infinity, and negative values rejected with 400.
  function validateNumPatch(v: unknown, fieldName: string): { ok: true; value: number | null } | { ok: false; error: string } {
    if (v === null || v === undefined || v === '') return { ok: true, value: null }
    const n = Number(v)
    if (isNaN(n) || !isFinite(n)) return { ok: false, error: `${fieldName} must be a valid finite number` }
    if (n < 0) return { ok: false, error: `${fieldName} must be >= 0` }
    return { ok: true, value: n }
  }

  const numericFields = ['validity_days', 'wholesale_cost', 'client_price'] as const
  for (const field of numericFields) {
    if (field in rest) {
      const result = validateNumPatch(rest[field], field)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in rest) {
      if ((numericFields as readonly string[]).includes(key)) {
        const result = validateNumPatch(rest[key], key)
        updates[key] = result.ok ? result.value : null
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
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration phases4_16_workspace_tables.sql in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to process request. Please retry.' }, { status: 500 })
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
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Database table not ready — apply migration phases4_16_workspace_tables.sql in the Supabase SQL editor.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Unable to process request. Please retry.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
