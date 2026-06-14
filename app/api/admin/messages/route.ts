import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/messages?lead_id=xxx
// Returns all messages for a lead, marks lead as read
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lead_id = searchParams.get('lead_id')

  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lead_id', lead_id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[messages/GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mark lead as read
  await supabase.from('leads').update({ unread_count: 0 }).eq('id', lead_id)

  return NextResponse.json({ messages: messages ?? [] })
}
