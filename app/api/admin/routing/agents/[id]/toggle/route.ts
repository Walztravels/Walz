import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// P1 security hotfix (2026-09-19): same resource/vulnerability class as
// PATCH/DELETE on the sibling [id] route — session-only, no permission
// check. Flipping `active` on an arbitrary RoutingAgent row (e.g.
// deactivating a colleague so routing stops sending them conversations)
// is a real tamper vector on the exact table this hotfix protects, so it
// gets the same gate even though it wasn't separately enumerated.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing/agents/:id/toggle] permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

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
