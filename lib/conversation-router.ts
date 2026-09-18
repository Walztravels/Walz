import { getSupabaseAdmin } from '@/lib/supabase'
import { sendConversationAssignedEmail } from '@/lib/email-staff-notification'
import { botChatwootOrNull, logChatwootUnconfigured } from '@/lib/chatwoot/config'
import { isAutoAssignable } from '@/lib/inbox/assignable'

const CHATWOOT_BASE  = process.env.CHATWOOT_BASE_URL  ?? 'https://chat.walztravels.com'
// Fail closed (INBOX-0S.1): empty token → assignment calls are skipped
// with a log instead of using a baked credential.
const CHATWOOT_TOKEN = botChatwootOrNull()?.token ?? ''
const ACCOUNT_ID     = process.env.CHATWOOT_ACCOUNT_ID ?? '1'

export interface RoutingDecision {
  agentId:    string
  agentName:  string
  agentEmail: string | null
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
  // Non-routable/test identities (P1 2026-09-18): never auto-assignable,
  // independent of any row flag. Real staff rows pass through unchanged.
  return ((data ?? []) as RoutingAgent[]).filter(a => a.chatwootAgentId == null || isAutoAssignable(a.chatwootAgentId))
}

async function getEscalationAgents(): Promise<RoutingAgent[]> {
  const supabase = getSupabaseAdmin()
  // P1 2026-09-18: this query previously ignored active=false and had no
  // identity rule — the inactive TEST identity (Michael, id 1) kept
  // receiving escalations. Both gates now apply.
  const { data } = await supabase
    .from('RoutingAgent')
    .select('*')
    .eq('isEscalation', true)
    .eq('active', true)
  return ((data ?? []) as RoutingAgent[]).filter(a => isAutoAssignable(a.chatwootAgentId))
}

async function getNextRoundRobin(): Promise<RoutingAgent | null> {
  const supabase = getSupabaseAdmin()

  // Compare-and-swap (INBOX-0S.4): the position bump only applies if the
  // row still holds the position we read, so two concurrent webhooks can't
  // both claim the same slot. On contention, retry once with fresh state.
  for (let attempt = 0; attempt < 2; attempt++) {
    const agents = await getActiveRoutingAgents()
    if (!agents.length) return null

    const next = agents.reduce((a, b) =>
      a.roundRobinPosition <= b.roundRobinPosition ? a : b,
    )

    // Bump position by agent count — keeps a persistent rotating queue
    const { data: claimed } = await supabase
      .from('RoutingAgent')
      .update({ roundRobinPosition: next.roundRobinPosition + agents.length, updatedAt: new Date().toISOString() })
      .eq('id', next.id)
      .eq('roundRobinPosition', next.roundRobinPosition)
      .select('id')

    if (claimed?.length) return next
  }

  // Still contended after a retry — degrade to first active agent so the
  // conversation is never left unassigned.
  const agents = await getActiveRoutingAgents()
  return agents.length ? agents[0] : null
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
    agentEmail: agent.email ?? null,
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
      agentEmail: null,
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
  opts?:          { suppressAssignmentEmail?: boolean },
): Promise<boolean> {
  if (dec.reason === 'previously_routed') return false

  const supabase = getSupabaseAdmin()

  // Assign in Chatwoot
  let assignmentSucceeded = false
  // Final automatic-assignment guard (P1 2026-09-18): whatever decision
  // source produced this id, a non-routable identity is never assigned.
  if (dec.chatwootId && !isAutoAssignable(dec.chatwootId)) {
    console.warn(`[router] blocked automatic assignment to non-routable agent id ${dec.chatwootId} — conversation left unassigned`)
    dec = { ...dec, chatwootId: null }
  }
  if (dec.chatwootId && !CHATWOOT_TOKEN) logChatwootUnconfigured('conversation-router assignment')
  if (dec.chatwootId && CHATWOOT_TOKEN) {
    const assignRes = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      {
        method:  'POST',
        headers: { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignee_id: dec.chatwootId }),
      },
    ).catch((e) => { console.error('[router] Chatwoot assignment error:', e); return null })
    assignmentSucceeded = !!assignRes?.ok
  }

  // Email the agent only when Chatwoot assignment succeeded
  // (callers that send their own notification pass suppressAssignmentEmail)
  if (assignmentSucceeded && dec.agentEmail && !opts?.suppressAssignmentEmail) {
    sendConversationAssignedEmail({
      agentName:      dec.agentName,
      agentEmail:     dec.agentEmail,
      conversationId,
      messagePreview: messagePreview,
      assignedBy:     'Jade AI',
    }).catch((e) => console.error('[router] assignment email error:', e))
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
  return assignmentSucceeded
}
