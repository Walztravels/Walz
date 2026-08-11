import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('itinerary_payment_schedule')
    .select('*')
    .eq('itinerary_id', id)
    .order('sort_order')
    .order('due_date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as {
    label: string; amount: number; currency?: string
    due_date?: string; notes?: string; sort_order?: number
  }
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('itinerary_payment_schedule').insert({
    itinerary_id: id,
    label:        body.label,
    amount:       body.amount,
    currency:     body.currency ?? 'GBP',
    due_date:     body.due_date ?? null,
    notes:        body.notes ?? null,
    sort_order:   body.sort_order ?? 0,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as Record<string, unknown> & { itemId: string }
  if (!body.itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  const { itemId, ...rest } = body
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('itinerary_payment_schedule').update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', itemId).eq('itinerary_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { itemId: string }
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('itinerary_payment_schedule').delete().eq('id', body.itemId).eq('itinerary_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
