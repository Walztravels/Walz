import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendConversationAssignedEmail } from '@/lib/email-staff-notification'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { validateAssigneeId, mapChatwootFailure, safeJson } from '@/lib/inbox/provider'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_assign')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => ({})) as { assignee_id?: unknown }
  const av = validateAssigneeId(body.assignee_id)
  if (!av.ok) return NextResponse.json({ error: av.error }, { status: 400 })
  const assignee_id = av.id

  const res = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/assignments`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
      body:    JSON.stringify({ assignee_id }),
    }
  ).catch(() => null)
  if (!res) return NextResponse.json({ error: 'Assignment failed — messaging service unreachable. Please try again.' }, { status: 502 })
  const data = await safeJson(res)

  // On success, look up the assigned agent and send them an email notification
  if (res.ok) {
    const supabase = getSupabaseAdmin()
    const { data: agent } = await supabase
      .from('RoutingAgent')
      .select('name, email')
      .eq('chatwootAgentId', assignee_id)
      .maybeSingle()

    if (agent?.email) {
      const assignerName = (session as any).name || (session as any).email || 'A team member'
      sendConversationAssignedEmail({
        agentName:      agent.name,
        agentEmail:     agent.email,
        conversationId: params.id,
        assignedBy:     assignerName,
      }).catch((e) => console.error('[assign] notification email error:', e))
    }
  }

  if (!res.ok) {
    console.error('[assign] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 300))
    const mapped = mapChatwootFailure(res.status, 'Assignment')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json(data ?? { ok: true })
}
