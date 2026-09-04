import { NextRequest, NextResponse } from 'next/server'
import { requestHumanHandoff, inferHandoffCategory } from '@/lib/jade/human-handoff'
import { getConversationHistory } from '@/lib/jade/chatwoot-client'

export const dynamic = 'force-dynamic'

// Small in-memory throttle: one handoff request per conversation per 30s.
// (requestHumanHandoff itself is duplicate-guarded via Chatwoot attrs — this
// just protects the endpoint from rapid re-clicks.)
const recent = new Map<number, number>()
const THROTTLE_MS = 30_000

/**
 * POST /api/jade/handoff — the floating "Speak to Human" button. ONE CLICK:
 * no category selector, no confirmation step. The category is inferred
 * server-side from recent conversation context (deterministic keywords);
 * with no reliable signal it falls back to 'general' and the existing
 * conversation-router picks the staff member.
 *
 * Body: { conversationId: number, channel?: string, customerName?: string }
 *
 * Rules honoured:
 *  - Sends NO customer-visible message (button never speaks for the customer).
 *  - Assignment only happens on an explicit request — never on visibility.
 *  - Same canonical path as typed requests (no separate logic).
 *  - A conversation must exist; without one there is nothing to hand off, so
 *    the widget shows a "send a message first" hint instead (needsMessage).
 */
export async function POST(req: NextRequest) {
  let body: { conversationId?: unknown; channel?: unknown; customerName?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }

  const conversationId = Number(body?.conversationId)
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    // No Chatwoot conversation yet — nothing to route/assign.
    return NextResponse.json({ ok: false, needsMessage: true }, { status: 200 })
  }

  const last = recent.get(conversationId) ?? 0
  if (Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ ok: true, alreadyRequested: true, assignedAgentName: null })
  }
  recent.set(conversationId, Date.now())

  const channel      = typeof body?.channel === 'string' && body.channel ? body.channel.slice(0, 40) : 'website chat'
  const customerName = typeof body?.customerName === 'string' ? body.customerName.slice(0, 80) : null

  // Infer category from recent conversation context; 'general' when unclear.
  let category: ReturnType<typeof inferHandoffCategory> = 'general'
  try {
    const history = await getConversationHistory(conversationId, 20)
    const text    = history.filter(m => m.message_type === 0).map(m => m.content ?? '').join('\n')
    category = inferHandoffCategory(text)
  } catch { /* keep 'general' */ }

  const result = await requestHumanHandoff({
    conversationId,
    category,
    source: 'button',
    reason: 'Customer clicked “Speak to Human”',
    channel,
    customerName,
  })

  return NextResponse.json({
    ok:                result.ok,
    alreadyRequested:  result.alreadyRequested,
    assignedAgentName: result.assignedAgentName,
    category:          result.category,
  })
}
