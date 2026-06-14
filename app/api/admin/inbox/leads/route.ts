import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/inbox/leads
// Returns leads that have at least one message, ordered by last_message_at DESC
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel') // whatsapp | instagram | null=all
  const unread  = searchParams.get('unread') === 'true'

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('leads')
    .select('id, name, whatsapp, whatsapp_number, instagram_handle, channel, last_message_at, last_message_preview, unread_count, status, source, assigned_to')
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (channel) query = query.eq('channel', channel)
  if (unread)  query = query.gt('unread_count', 0)

  const { data: leads, error } = await query

  if (error) {
    console.error('[inbox/leads GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: leads ?? [] })
}

// GET /api/admin/inbox/leads/unread-count — total unread badge
export async function HEAD() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('leads')
    .select('unread_count')
    .gt('unread_count', 0)

  const total = (data ?? []).reduce((sum: number, row: { unread_count: number }) => sum + (row.unread_count ?? 0), 0)
  return new Response(null, { status: 200, headers: { 'X-Unread-Count': String(total) } })
}
