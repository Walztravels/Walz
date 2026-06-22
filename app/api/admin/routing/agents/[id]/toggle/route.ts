import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: current } = await supabase
    .from('RoutingAgent')
    .select('active, name')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const next = !current.active
  const { data, error } = await supabase
    .from('RoutingAgent')
    .update({ active: next, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[routing] ${session.email} toggled ${current.name} → ${next ? 'active' : 'away'}`)
  return NextResponse.json({ agent: data })
}
