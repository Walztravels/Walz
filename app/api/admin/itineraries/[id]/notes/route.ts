import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('itinerary_internal_notes')
    .select('*')
    .eq('itinerary_id', id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { body?: string; pinned?: boolean }
  if (!body.body?.trim()) return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('itinerary_internal_notes').insert({
    itinerary_id: id,
    author:       session.email ?? session.name ?? 'Staff',
    body:         body.body.trim(),
    pinned:       body.pinned ?? false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { noteId: string; body?: string; pinned?: boolean }
  if (!body.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.body   !== undefined) update.body   = body.body
  if (body.pinned !== undefined) update.pinned = body.pinned
  const { data, error } = await sb.from('itinerary_internal_notes').update(update).eq('id', body.noteId).eq('itinerary_id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { noteId: string }
  if (!body.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('itinerary_internal_notes').delete().eq('id', body.noteId).eq('itinerary_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
