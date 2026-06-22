import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { routeConversation } from '@/lib/conversation-router'
import { transferCallToAgent, sendInsightCard } from '@/lib/aircall-api'

export const dynamic = 'force-dynamic'

type AircallCall = {
  id:                  number
  direction:           string
  raw_digits?:         string
  number?:             { digits?: string }
  missed_call_reason?: string | null
  user?:               { id?: number; name?: string }
}

async function notifyEscalation(
  title: string,
  body:  string,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: escalation } = await supabase
    .from('RoutingAgent')
    .select('id, name, email')
    .eq('isEscalation', true)

  for (const agent of escalation ?? []) {
    // Push notification stub — replace with real Web Push once notifications are built
    console.log(`[aircall] Push → ${agent.name} (${agent.email}): ${title} — ${body}`)
  }
}

async function handleInboundCall(call: AircallCall): Promise<void> {
  const supabase    = getSupabaseAdmin()
  const callId      = call.id.toString()
  const routeKey    = `aircall_${callId}`
  const callerNum   = call.raw_digits ?? call.number?.digits ?? 'unknown'

  // Check if caller has been routed before (caller continuity)
  const { data: previous } = await supabase
    .from('ConversationRoute')
    .select('assignedTo, assignedToName')
    .ilike('messagePreview', `%${callerNum}%`)
    .eq('channel', 'voice')
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle()

  let decision = previous?.assignedTo
    ? {
        agentId:    previous.assignedTo as string,
        agentName:  previous.assignedToName as string ?? '',
        chatwootId: null as null,
        aircallId:  null as null,
        reason:     'known_caller',
      }
    : await routeConversation(routeKey, `Inbound call from ${callerNum}`, 'voice')

  if (!decision) {
    console.log('[aircall] No routing agents available for call', callId)
    return
  }

  // Fetch aircallUserId for this agent if not set from previous route
  if (!decision.aircallId && decision.agentId) {
    const { data: agent } = await supabase
      .from('RoutingAgent')
      .select('aircallUserId')
      .eq('id', decision.agentId)
      .maybeSingle()
    decision = { ...decision, aircallId: (agent as { aircallUserId?: number | null } | null)?.aircallUserId ?? null }
  }

  // Transfer in Aircall
  if (decision.aircallId) {
    await transferCallToAgent(callId, decision.aircallId)
    await sendInsightCard(callId, {
      callerNumber: callerNum,
      assignedTo:   decision.agentName,
      reason:       decision.reason,
    })
  }

  // Record in ConversationRoute
  await supabase.from('ConversationRoute').upsert({
    chatwootConversationId: routeKey,
    assignedTo:             decision.agentId,
    assignedToName:         decision.agentName,
    channel:                'voice',
    routingReason:          decision.reason,
    messagePreview:         `Inbound call from ${callerNum}`,
    status:                 'active',
    assignedAt:             new Date().toISOString(),
  })

  console.log(`[aircall] Call ${callId} from ${callerNum} → ${decision.agentName} (${decision.reason})`)
}

async function handleCallEnded(call: AircallCall): Promise<void> {
  const supabase = getSupabaseAdmin()
  const callId   = call.id.toString()
  const routeKey = `aircall_${callId}`

  await supabase
    .from('ConversationRoute')
    .update({ status: call.missed_call_reason ? 'missed' : 'completed' })
    .eq('chatwootConversationId', routeKey)

  if (call.missed_call_reason) {
    const callerNum = call.raw_digits ?? 'unknown'
    await notifyEscalation('Missed Call', `${callerNum} — ${call.missed_call_reason}`)

    const { data: route } = await supabase
      .from('ConversationRoute')
      .select('assignedTo, assignedToName')
      .eq('chatwootConversationId', routeKey)
      .maybeSingle()

    if (route?.assignedToName) {
      console.log(`[aircall] Push → ${route.assignedToName}: Missed call from ${callerNum}`)
    }
  }

  console.log(`[aircall] Call ${callId} ended:`, call.missed_call_reason ?? 'answered')
}

async function handleVoicemail(call: AircallCall): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('ConversationRoute')
    .update({ status: 'voicemail' })
    .eq('chatwootConversationId', `aircall_${call.id}`)

  const callerNum = call.raw_digits ?? 'unknown'
  await notifyEscalation('New Voicemail', `Voicemail from ${callerNum}`)
  console.log(`[aircall] Voicemail from ${callerNum} for call ${call.id}`)
}

export async function POST(req: NextRequest) {
  const token    = req.headers.get('x-aircall-token') ?? ''
  const expected = process.env.AIRCALL_WEBHOOK_TOKEN ?? ''

  if (expected && token !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const body  = await req.json() as { event?: string; data?: AircallCall }
    const event = body.event
    const call  = body.data

    if (!call) return NextResponse.json({ ok: true })

    switch (event) {
      case 'call.created':
        if (call.direction === 'inbound') await handleInboundCall(call)
        break
      case 'call.ended':
        await handleCallEnded(call)
        break
      case 'call.voicemail_left':
        await handleVoicemail(call)
        break
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[aircall-webhook] Error:', e)
    return NextResponse.json({ ok: true }) // always 200 to avoid Aircall retries
  }
}
