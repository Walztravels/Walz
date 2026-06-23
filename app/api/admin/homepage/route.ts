import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('HomepageContent')
    .select('section, data')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const content: Record<string, unknown> = {}
  data?.forEach(row => { content[row.section] = row.data })
  return NextResponse.json({ content })
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json() as { section?: string; data?: unknown }
  if (!body.section) {
    return NextResponse.json({ error: 'section is required' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('HomepageContent')
    .upsert(
      { section: body.section, data: body.data, updatedAt: new Date().toISOString() },
      { onConflict: 'section' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
