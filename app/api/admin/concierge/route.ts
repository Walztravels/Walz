import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'ALL'
  const search = searchParams.get('search') ?? ''
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = 25
  const offset = (page - 1) * limit

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('concierge_requests')
    .select(`
      id, reference, status, sla, intent_fields, created_at, updated_at,
      jade_session_id, client_name, client_email, chatwoot_conv_id,
      assigned_to, internal_notes,
      category:concierge_categories ( name, slug )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status !== 'ALL') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `reference.ilike.%${search}%,client_name.ilike.%${search}%,client_email.ilike.%${search}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[Admin/Concierge] GET error:', error)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }

  return NextResponse.json({
    requests:    data ?? [],
    total:       count ?? 0,
    page,
    totalPages:  Math.ceil((count ?? 0) / limit),
  })
}
