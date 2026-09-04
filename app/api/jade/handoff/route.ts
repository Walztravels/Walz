import { NextRequest, NextResponse } from 'next/server'
import { requestHumanHandoff, isHandoffCategory } from '@/lib/jade/human-handoff'

export const dynamic = 'force-dynamic'

// Small in-memory throttle: one handoff request per conversation per 30s.
// (requestHumanHandoff itself is duplicate-guarded via Chatwoot attrs — this
// just protects the endpoint from rapid re-clicks.)
const recent = new Map<number, number>()
const THROTTLE_MS = 30_000

/**
 * POST /api/jade/handoff — the floating "Speak to a Human" button.
 *
 * Body: { conversationId: number, category: HandoffCategory, channel?: string }
 *
 * Rules honoured:
 *  - Sends NO customer-visible message (button never speaks for the customer).
 *  - Assignment only happens on an explicit request — never on visibility.
 *  - Uses the exact same canonical path as typed requests (no separate logic).
 *  - A conversation must exist; without one there is nothing to hand off, so
 *    the widget shows a "send a message first" hint instead (needsMessage).
 */
export async function POST(req: NextRequest) {
  let body: { conversationId?: unknown; category?: unknown; channel?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }

  const category = body?.category
  if (!isHandoffCategory(category)) {
    return NextResponse.json({ ok: false, error: 'Invalid category' }, { status: 400 })
  }

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

  const channel = typeof body?.channel === 'string' && body.channel ? body.channel.slice(0, 40) : 'website chat'

  const result = await requestHumanHandoff({
    conversationId,
    category,
    source: 'button',
    channel,
  })

  return NextResponse.json({
    ok:                result.ok,
    alreadyRequested:  result.alreadyRequested,
    assignedAgentName: result.assignedAgentName,
  })
}
