import { getSupabaseAdmin } from '@/lib/supabase'
import {
  AGENTS,
  getAgentBySpecialism,
  getNextRoundRobin,
  getAgentById,
  isAgentActive,
  type Agent,
} from '@/lib/agent-roster'

const CHATWOOT_BASE  = process.env.CHATWOOT_BASE_URL  ?? 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = process.env.CHATWOOT_ACCOUNT_ID ?? '1'

export interface RoutingDecision {
  agent:      Agent
  reason:     string
  confidence: 'high' | 'medium' | 'low'
}

export async function routeConversation(
  conversationId: string,
  messageContent: string,
  channel:        string,
): Promise<RoutingDecision> {
  const supabase = getSupabaseAdmin()

  // 1. Check if already routed
  const { data: existing } = await supabase
    .from('ConversationRoute')
    .select('assignedTo')
    .eq('chatwootConversationId', conversationId)
    .maybeSingle()

  if (existing?.assignedTo) {
    const agent = getAgentById(existing.assignedTo)
    if (agent) {
      return { agent, reason: 'previously_routed', confidence: 'high' }
    }
  }

  // 2. Content-based specialism routing
  const specialist = getAgentBySpecialism(messageContent)
  if (specialist) {
    const matchedKeyword = specialist.specialisms.find((s) =>
      messageContent.toLowerCase().includes(s),
    )
    return {
      agent:      specialist,
      reason:     `specialism:${matchedKeyword ?? 'match'}`,
      confidence: 'high',
    }
  }

  // 3. Channel-based routing — WhatsApp always goes to Anita
  const ch = channel.toLowerCase()
  if (ch.includes('whatsapp')) {
    const anita = AGENTS.find((a) => a.id === 'anita' && isAgentActive('anita'))
    if (anita) {
      return { agent: anita, reason: 'whatsapp_channel', confidence: 'high' }
    }
  }

  // 4. Round-robin fallback
  const agent = getNextRoundRobin()
  return { agent, reason: 'round_robin', confidence: 'low' }
}

export async function applyRouting(
  conversationId: string,
  decision:       RoutingDecision,
  messagePreview: string,
  channel:        string,
): Promise<void> {
  const supabase = getSupabaseAdmin()

  // Skip if already routed (previously_routed decisions are re-confirmed, not re-applied)
  if (decision.reason === 'previously_routed') return

  // Assign in Chatwoot
  if (decision.agent.chatwootId > 0) {
    await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      {
        method:  'POST',
        headers: {
          'api_access_token': CHATWOOT_TOKEN,
          'Content-Type':     'application/json',
        },
        body: JSON.stringify({ assignee_id: decision.agent.chatwootId }),
      },
    ).catch((e) => console.error('[router] Chatwoot assignment error:', e))
  }

  // Record routing in Supabase
  await supabase.from('ConversationRoute').upsert({
    chatwootConversationId: conversationId,
    assignedTo:             decision.agent.id,
    assignedToName:         decision.agent.name,
    channel:                channel || 'unknown',
    routingReason:          decision.reason,
    messagePreview:         messagePreview.substring(0, 150),
    status:                 'active',
    assignedAt:             new Date().toISOString(),
  })

  console.log(
    `[router] ${conversationId} → ${decision.agent.name}` +
    ` (${decision.reason}, confidence=${decision.confidence})`,
  )
}
