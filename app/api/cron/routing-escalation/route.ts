import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { botChatwootOrNull, logChatwootUnconfigured } from '@/lib/chatwoot/config'
import { isAutoAssignable } from '@/lib/inbox/assignable'

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
    .select('id, name, email, chatwootAgentId, active')
    .eq('isEscalation', true)
    .eq('active', true)

  const cw = botChatwootOrNull()
  if (!cw) {
    logChatwootUnconfigured('routing-escalation')
    return NextResponse.json({ ok: false, error: 'Chatwoot not configured' }, { status: 503 })
  }
  const chatwootBase  = process.env.CHATWOOT_BASE_URL   ?? 'https://chat.walztravels.com'
  const chatwootToken = cw.token
  const accountId     = cw.accountId

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

      // Re-assign to the first ELIGIBLE escalation agent (P1 2026-09-18:
      // this previously picked the inactive TEST identity, Michael/id 1 —
      // conversation #483). Non-routable identities are never selected.
      const esc = (escalationAgents ?? []).find(a => isAutoAssignable(a.chatwootAgentId))
      if (!esc) {
        // Escalation evidence (the private note above) is preserved; the
        // conversation stays with its current state rather than being
        // handed to an ineligible identity.
        console.warn(`[cron:escalation] NO_ELIGIBLE_ESCALATION_AGENT — conversation ${route.chatwootConversationId} not reassigned`)
      }
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
