import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// P1 security hotfix (2026-09-19): this table maps staff email → Chatwoot
// agent id, the identity resolveChatwootAgentId() trusts to decide which
// conversations a staff member may see/reply to/reassign. Before this fix
// GET/POST here (and PATCH/DELETE on [id]) required only a valid session —
// ANY authenticated staff member could read every colleague's mapping and
// repoint their own row at someone else's chatwootAgentId, then inherit
// that colleague's conversation access. 'settings_integrations' is the
// narrowest existing permission that fits "manage the staff↔Chatwoot
// routing identity mapping" — by default only super_admin holds it, and
// it can be granted to a specific trusted staff member without making
// them a full super_admin.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing/agents] permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('RoutingAgent')
    .select('*')
    .order('roundRobinPosition', { ascending: true })

  if (error) {
    console.error('[routing/agents] GET error:', error)
    return NextResponse.json({ agents: [], error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ agents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing/agents] permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const body = await req.json() as {
    name:              string
    email:             string
    sipAddress?:       string | null
    chatwootAgentId?:  number | null
    aircallUserId?:    number | null
    role?:             string
    specialisms?:      string[]
    active?:           boolean
    isEscalation?:     boolean
    maxConversations?: number
  }

  if (!body.name || !body.email) {
    return NextResponse.json({ error: 'name and email required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Get current agent count to set initial round-robin position
  const { count } = await supabase
    .from('RoutingAgent')
    .select('*', { count: 'exact', head: true })
    .eq('isEscalation', false)

  const { data, error } = await supabase
    .from('RoutingAgent')
    .insert({
      name:               body.name.trim(),
      email:              body.email.trim().toLowerCase(),
      sipAddress:         body.sipAddress?.trim() || null,
      chatwootAgentId:    body.chatwootAgentId ?? null,
      aircallUserId:      body.aircallUserId ?? null,
      role:               body.role?.trim() ?? null,
      specialisms:        body.specialisms ?? [],
      active:             body.active ?? true,
      isEscalation:       body.isEscalation ?? false,
      maxConversations:   body.maxConversations ?? 15,
      roundRobinPosition: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An agent with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ agent: data }, { status: 201 })
}
