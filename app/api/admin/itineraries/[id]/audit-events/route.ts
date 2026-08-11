import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('itinerary_audit_events')
    .select('*')
    .eq('itinerary_id', id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as {
    event_type: string
    old_value?: unknown
    new_value?: unknown
  }
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('itinerary_audit_events').insert({
    itinerary_id: id,
    actor:        session.email ?? session.name ?? 'Staff',
    event_type:   body.event_type,
    old_value:    body.old_value ?? null,
    new_value:    body.new_value ?? null,
    ip_address:   req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent:   req.headers.get('user-agent') ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
