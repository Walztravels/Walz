import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// P1 security hotfix (2026-09-19): this row's chatwootAgentId is the
// identity resolveChatwootAgentId() trusts. Before this fix ANY
// authenticated staff member could PATCH ANY row here — including their
// own — to an arbitrary chatwootAgentId taken straight from the request
// body, and inherit another agent's (or a manager's) full conversation
// access. Never trust an id/role/email/ownership claim from the browser —
// the gate below is a server-side session permission check, matching the
// permission chosen for POST/GET on the sibling collection route.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing/agents/:id] PATCH permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const { id }  = await params
  const body    = await req.json() as Partial<{
    name:             string
    email:            string
    sipAddress:       string | null
    chatwootAgentId:  number | null
    aircallUserId:    number | null
    role:             string | null
    specialisms:      string[]
    active:           boolean
    isEscalation:     boolean
    maxConversations: number
  }>

  // Fix 5 (P1 hotfix, 2026-09-19, hygiene): body is only compile-time typed —
  // a runtime caller could smuggle an `id` key into the JSON and have it
  // spread into the update below. The .eq('id', id) WHERE clause already
  // scopes this to the URL param's row (so this can never repoint the
  // update at a DIFFERENT row), but defensively strip it so it can't also
  // corrupt the targeted row's own primary key.
  delete (body as Record<string, unknown>).id

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('RoutingAgent')
    .update({ ...body, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing/agents/:id] DELETE permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const { id } = await params
  const supabase = getSupabaseAdmin()

  // Soft delete — set active: false
  const { error } = await supabase
    .from('RoutingAgent')
    .update({ active: false, updatedAt: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
