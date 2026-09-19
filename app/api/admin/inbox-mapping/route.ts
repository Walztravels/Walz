import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// GET /api/admin/inbox-mapping
// Returns all routing_agents records (email → chatwoot agent ID mapping)
//
// P1 security hotfix (2026-09-19), Fix 2: this was gated on 'inbox_view' —
// a permission nearly every role holds by default — despite returning the
// same email↔chatwootAgentId reconnaissance data the routing-agent
// impersonation exploit needed. Tightened to 'settings_integrations',
// matching the other routing-identity-mapping routes (routing/agents,
// routing/route.ts). Consumers that only need to resolve THEIR OWN
// chatwootAgentId (app/admin/inbox/page.tsx) already fall back to matching
// their email against the live Chatwoot agents list when this DB-mapping
// lookup is unavailable to them.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[inbox-mapping] permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('RoutingAgent')
    .select('id, name, email, chatwootAgentId, role, active')
    .order('email')

  if (error) {
    console.error('[inbox-mapping GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ mappings: data ?? [] })
}

// POST /api/admin/inbox-mapping
// Upsert a routing_agent record (email → chatwoot agent ID)
// Super admin only
export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const body = await req.json() as { email?: string; name?: string; chatwootAgentId?: number; role?: string; active?: boolean }
  const { email, name, chatwootAgentId, role, active } = body

  if (!email || !chatwootAgentId) {
    return NextResponse.json({ error: 'email and chatwootAgentId are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('RoutingAgent')
    .upsert(
      {
        email:           email.toLowerCase().trim(),
        name:            name ?? email,
        chatwootAgentId: chatwootAgentId,
        role:            role ?? 'agent',
        active:          active ?? true,
      },
      { onConflict: 'email' }
    )
    .select()
    .single()

  if (error) {
    console.error('[inbox-mapping POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ mapping: data })
}

// DELETE /api/admin/inbox-mapping?email=...
// Remove a routing_agent mapping — super admin only
export async function DELETE(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('RoutingAgent')
    .delete()
    .eq('email', email.toLowerCase().trim())

  if (error) {
    console.error('[inbox-mapping DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
