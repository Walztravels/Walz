import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel cron authorization
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = getSupabaseAdmin()
  const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Conversations that have been active for > 30 minutes
  const { data: stale } = await supabase
    .from('ConversationRoute')
    .select('id, chatwootConversationId, assignedToName, assignedAt, messagePreview')
    .eq('status', 'active')
    .lt('assignedAt', threshold)

  if (!stale?.length) {
    return NextResponse.json({ escalated: 0 })
  }

  const { data: escalationAgents } = await supabase
    .from('RoutingAgent')
    .select('id, name, email, chatwootAgentId')
    .eq('isEscalation', true)

  const chatwootBase  = process.env.CHATWOOT_BASE_URL   ?? 'https://chat.walztravels.com'
  const chatwootToken = process.env.CHATWOOT_API_TOKEN  ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
  const accountId     = process.env.CHATWOOT_ACCOUNT_ID ?? '1'

  let escalated = 0

  for (const route of stale) {
    try {
      // Add private note in Chatwoot
      await fetch(
        `${chatwootBase}/api/v1/accounts/${accountId}/conversations/${route.chatwootConversationId}/messages`,
        {
          method:  'POST',
          headers: { api_access_token: chatwootToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            content:       `⚠️ Escalation: This conversation has been unattended for over 30 minutes. Originally assigned to ${route.assignedToName}.`,
            message_type:  2, // private note
            private:       true,
          }),
        },
      ).catch(() => {})

      // Re-assign to first escalation agent if they have a Chatwoot ID
      const esc = (escalationAgents ?? []).find(a => a.chatwootAgentId)
      if (esc?.chatwootAgentId) {
        await fetch(
          `${chatwootBase}/api/v1/accounts/${accountId}/conversations/${route.chatwootConversationId}/assignments`,
          {
            method:  'POST',
            headers: { api_access_token: chatwootToken, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ assignee_id: esc.chatwootAgentId }),
          },
        ).catch(() => {})
      }

      // Log notifications
      for (const agent of escalationAgents ?? []) {
        console.log(
          `[cron:escalation] Notify ${agent.name} (${agent.email}): Conversation #${route.chatwootConversationId} unattended 30min`,
        )
      }

      escalated++
    } catch (e) {
      console.error('[cron:escalation] Error processing route:', route.id, e)
    }
  }

  // Bulk mark as escalated
  const ids = stale.map(r => r.id)
  await supabase
    .from('ConversationRoute')
    .update({ status: 'escalated' })
    .in('id', ids)

  console.log(`[cron:escalation] Escalated ${escalated}/${stale.length} conversations`)
  return NextResponse.json({ escalated, total: stale.length })
}
