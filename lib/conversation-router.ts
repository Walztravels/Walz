import { getSupabaseAdmin } from '@/lib/supabase'

const CHATWOOT_BASE  = process.env.CHATWOOT_BASE_URL  ?? 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = process.env.CHATWOOT_ACCOUNT_ID ?? '1'

export interface RoutingDecision {
  agentId:    string
  agentName:  string
  chatwootId: number | null
  aircallId:  number | null
  reason:     string
}

type RoutingAgent = {
  id:                string
  name:              string
  email:             string
  chatwootAgentId:   number | null
  aircallUserId:     number | null
  role:              string | null
  specialisms:       string[]
  active:            boolean
  isEscalation:      boolean
  maxConversations:  number
  roundRobinPosition: number
}

async function getActiveRoutingAgents(): Promise<RoutingAgent[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('RoutingAgent')
    .select('*')
    .eq('active', true)
    .eq('isEscalation', false)
    .order('roundRobinPosition', { ascending: true })
  return (data ?? []) as RoutingAgent[]
}

async function getEscalationAgents(): Promise<RoutingAgent[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('RoutingAgent')
    .select('*')
    .eq('isEscalation', true)
  return (data ?? []) as RoutingAgent[]
}

async function getNextRoundRobin(): Promise<RoutingAgent | null> {
  const supabase = getSupabaseAdmin()
  const agents   = await getActiveRoutingAgents()
  if (!agents.length) return null

  const next = agents.reduce((a, b) =>
    a.roundRobinPosition <= b.roundRobinPosition ? a : b,
  )

  // Bump position by agent count — keeps a persistent rotating queue
  await supabase
    .from('RoutingAgent')
    .update({ roundRobinPosition: next.roundRobinPosition + agents.length, updatedAt: new Date().toISOString() })
    .eq('id', next.id)

  return next
}

async function getAgentBySpecialism(message: string): Promise<RoutingAgent | null> {
  const agents = await getActiveRoutingAgents()
  const lower  = message.toLowerCase()
  for (const agent of agents) {
    if ((agent.specialisms ?? []).some((s) => lower.includes(s.toLowerCase()))) {
      return agent
    }
  }
  return null
}

function decision(agent: RoutingAgent, reason: string): RoutingDecision {
  return {
    agentId:    agent.id,
    agentName:  agent.name,
    chatwootId: agent.chatwootAgentId ?? null,
    aircallId:  agent.aircallUserId ?? null,
    reason,
  }
}

export async function routeConversation(
  conversationId: string,
  messageContent: string,
  channel:        string,
): Promise<RoutingDecision | null> {
  const supabase = getSupabaseAdmin()

  // Already routed — return existing without touching the DB
  const { data: existing } = await supabase
    .from('ConversationRoute')
    .select('assignedTo, assignedToName')
    .eq('chatwootConversationId', conversationId)
    .maybeSingle()

  if (existing?.assignedTo) {
    return {
      agentId:    existing.assignedTo,
      agentName:  existing.assignedToName ?? '',
      chatwootId: null,
      aircallId:  null,
      reason:     'previously_routed',
    }
  }

  // 1. Specialism keyword match
  const specialist = await getAgentBySpecialism(messageContent)
  if (specialist) {
    const kw = specialist.specialisms.find((s) => messageContent.toLowerCase().includes(s.toLowerCase()))
    return decision(specialist, `specialism:${kw ?? 'match'}`)
  }

  // 2. WhatsApp channel — try to find an agent with 'whatsapp' specialism
  const ch = channel.toLowerCase()
  if (ch.includes('whatsapp')) {
    const whatsappAgent = (await getActiveRoutingAgents()).find((a) =>
      (a.specialisms ?? []).includes('whatsapp'),
    )
    if (whatsappAgent) return decision(whatsappAgent, 'whatsapp_channel')
  }

  // 3. Round robin fallback
  const rrAgent = await getNextRoundRobin()
  if (rrAgent) return decision(rrAgent, 'round_robin')

  // 4. No active agents — use escalation
  const [esc] = await getEscalationAgents()
  if (esc) return decision(esc, 'no_agents_escalated')

  return null
}

export async function applyRouting(
  conversationId: string,
  dec:            RoutingDecision,
  messagePreview: string,
  channel:        string,
): Promise<void> {
  if (dec.reason === 'previously_routed') return

  const supabase = getSupabaseAdmin()

  // Assign in Chatwoot
  if (dec.chatwootId) {
    await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      {
        method:  'POST',
        headers: { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignee_id: dec.chatwootId }),
      },
    ).catch((e) => console.error('[router] Chatwoot assignment error:', e))
  }

  // Record in ConversationRoute
  await supabase.from('ConversationRoute').upsert({
    chatwootConversationId: conversationId,
    assignedTo:             dec.agentId,
    assignedToName:         dec.agentName,
    channel:                channel || 'unknown',
    routingReason:          dec.reason,
    messagePreview:         messagePreview.substring(0, 150),
    status:                 'active',
    assignedAt:             new Date().toISOString(),
  })

  console.log(`[router] ${conversationId} → ${dec.agentName} (${dec.reason})`)
}
