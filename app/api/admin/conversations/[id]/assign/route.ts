import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendConversationAssignedEmail } from '@/lib/email-staff-notification'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'

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

  const { assignee_id } = await req.json() as { assignee_id: number }

  const res = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/assignments`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
      body:    JSON.stringify({ assignee_id }),
    }
  )
  const data = await res.json()

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

  return NextResponse.json(data)
}
