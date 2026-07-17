import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendConversationAssignedEmail } from '@/lib/email-staff-notification'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
