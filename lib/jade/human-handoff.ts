// lib/jade/human-handoff.ts
//
// Canonical "Speak to a Human" handoff path for ALL Jade surfaces.
//
// Every human-handoff — the floating button in the website widget / portal
// chat, a typed "speak to a human" in any channel, or Jade's own handoff
// tool — funnels through requestHumanHandoff(). There is exactly ONE
// assignment path: button and typed requests never diverge.
//
// Flow:
//   1. Duplicate guard — if the conversation already has
//      human_handoff_requested, do NOT assign again.
//   2. Record conversation custom attributes:
//        human_handoff_requested: true
//        handoff_category, handoff_reason
//   3. Move conversation pending → open (enters the agent queue).
//   4. Deterministic routing: category → routing keyword → existing
//      conversation-router (specialism match, then round-robin, then
//      escalation). Existing RBAC/routing rules are reused, never bypassed.
//   5. Chatwoot PRIVATE note (staff-only, never customer-facing).
//   6. Audit event in ActivityLog.
//
// This module NEVER sends a customer-visible message. Callers decide what
// (if anything) the customer sees, which keeps Meta/Instagram messaging-
// window rules with the code that owns the channel.

import { routeConversation, applyRouting } from '@/lib/conversation-router'
import { markHandover } from '@/lib/jade-session'
import prisma from '@/lib/db'

const CHATWOOT_BASE = process.env.CHATWOOT_BASE_URL || 'https://chat.walztravels.com'
const ACCOUNT_ID    = process.env.CHATWOOT_ACCOUNT_ID || '1'
const API_TOKEN     = process.env.CHATWOOT_API_TOKEN ?? ''

const api = (path: string) => `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}${path}`
const headers = { 'Content-Type': 'application/json', api_access_token: API_TOKEN }

// ── Categories ────────────────────────────────────────────────────────────────

export type HandoffCategory =
  | 'booking_support'
  | 'visa_support'
  | 'payment_issue'
  | 'complaint'
  | 'partnership'
  | 'other'

export interface HandoffCategoryDef {
  key:   HandoffCategory
  label: string
  /** Deterministic keyword fed to the conversation-router's specialism matcher. */
  routingKeyword: string
}

export const HANDOFF_CATEGORIES: HandoffCategoryDef[] = [
  { key: 'booking_support', label: 'Booking Support',        routingKeyword: 'booking' },
  { key: 'visa_support',    label: 'Visa Support',           routingKeyword: 'visa' },
  { key: 'payment_issue',   label: 'Payment Issue',          routingKeyword: 'payment' },
  { key: 'complaint',       label: 'Complaint',              routingKeyword: 'complaint' },
  { key: 'partnership',     label: 'Partnership / Business', routingKeyword: 'partnership' },
  { key: 'other',           label: 'Other',                  routingKeyword: 'general support' },
]

export const HANDOFF_CATEGORY_MAP: Record<HandoffCategory, HandoffCategoryDef> =
  Object.fromEntries(HANDOFF_CATEGORIES.map(c => [c.key, c])) as Record<HandoffCategory, HandoffCategoryDef>

export function isHandoffCategory(v: unknown): v is HandoffCategory {
  return typeof v === 'string' && v in HANDOFF_CATEGORY_MAP
}

// ── Explicit typed-request detection ──────────────────────────────────────────

// Matches the explicit phrases that must trigger the handoff path.
// Word-boundary anchored so "travel agents in Lagos" doesn't fire on "agent"
// alone unless it's a clear request; single words "human"/"agent" only fire
// as short standalone requests to avoid false positives mid-sentence.
const EXPLICIT_PHRASES =
  /speak to (a |an )?(human|agent|person|someone|staff)|talk to (a |an )?(human|agent|person|someone|staff)|speak with (a |an )?(human|agent|person|someone|staff)|customer (service|care|support)|call me\b|real person|human agent|live agent|connect me (to|with)|transfer me\b/i

const STANDALONE_WORD = /^(human|agent|representative|staff)[.!? ]*$/i

export function isExplicitHumanRequest(message: string): boolean {
  const m = message.trim()
  if (!m) return false
  return EXPLICIT_PHRASES.test(m) || STANDALONE_WORD.test(m)
}

// ── Request/Result shapes ─────────────────────────────────────────────────────

export interface HandoffRequest {
  conversationId: number
  category:       HandoffCategory
  /** 'button' = floating control; 'typed' = explicit phrase; 'jade_tool' = model tool */
  source:         'button' | 'typed' | 'jade_tool'
  channel?:       string
  /** Optional free-text detail; defaults derived from source. */
  reason?:        string
}

export interface HandoffResult {
  ok:                boolean
  alreadyRequested:  boolean
  assignedAgentName: string | null
  category:          HandoffCategory
}

function defaultReason(source: HandoffRequest['source']): string {
  if (source === 'button') return 'Customer explicitly selected “Speak to a Human”.'
  if (source === 'typed')  return 'Customer explicitly asked for a human agent.'
  return 'Jade determined a human specialist is needed.'
}

// ── Chatwoot helpers (kept local so this module is self-contained) ────────────

async function getConversationAttrs(conversationId: number): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(api(`/conversations/${conversationId}`), { headers, cache: 'no-store' })
    if (!res.ok) return {}
    const data = await res.json()
    return (data?.custom_attributes ?? data?.data?.custom_attributes ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function setConversationAttrs(conversationId: number, attrs: Record<string, unknown>): Promise<void> {
  await fetch(api(`/conversations/${conversationId}/custom_attributes`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ custom_attributes: attrs }),
  }).catch(e => console.error('[handoff] custom_attributes error:', e))
}

async function openConversationStatus(conversationId: number): Promise<void> {
  await fetch(api(`/conversations/${conversationId}/toggle_status`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ status: 'open' }),
  }).catch(e => console.error('[handoff] toggle_status error:', e))
}

async function postPrivateNote(conversationId: number, content: string): Promise<void> {
  await fetch(api(`/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, message_type: 'outgoing', private: true }),
  }).catch(e => console.error('[handoff] private-note error:', e))
}

// ── Canonical handoff ─────────────────────────────────────────────────────────

/**
 * The ONE human-handoff path. Never sends a customer-visible message,
 * never assigns twice, always leaves an audit trail.
 */
export async function requestHumanHandoff(req: HandoffRequest): Promise<HandoffResult> {
  const { conversationId, category, source } = req
  const def     = HANDOFF_CATEGORY_MAP[category] ?? HANDOFF_CATEGORY_MAP.other
  const reason  = req.reason?.trim() || defaultReason(source)
  const channel = req.channel || 'chat'

  // 1. Duplicate guard — one assignment per conversation handoff
  const attrs = await getConversationAttrs(conversationId)
  if (attrs['human_handoff_requested'] === true || attrs['human_handoff_requested'] === 'true') {
    return { ok: true, alreadyRequested: true, assignedAgentName: null, category: def.key }
  }

  // 2. Record handoff state on the conversation
  await setConversationAttrs(conversationId, {
    human_handoff_requested: true,
    handoff_category:        def.key,
    handoff_reason:          reason,
    handoff_source:          source,
    handoff_at:              new Date().toISOString(),
  })

  // 3. Enter the agent queue
  await openConversationStatus(conversationId)

  // 4. Deterministic routing via the existing router — category keyword drives
  //    specialism matching; router falls back to round-robin, then escalation.
  let assignedAgentName: string | null = null
  try {
    const dec = await routeConversation(String(conversationId), def.routingKeyword, channel)
    if (dec) {
      await applyRouting(String(conversationId), dec, `${def.label}: ${reason}`, channel)
      assignedAgentName = dec.agentName || null
    }
  } catch (e) {
    console.error('[handoff] routing/assignment error:', e)
  }

  // 5. Staff-only private note (exact spec format)
  await postPrivateNote(
    conversationId,
    `Jade handoff requested\n\nCategory: ${def.label}\n\nReason: ${reason}` +
      (assignedAgentName ? `\n\nAssigned: ${assignedAgentName}` : ''),
  )

  // 6. Silence Jade for this conversation (widget/portal switch to human mode)
  await markHandover(String(conversationId)).catch(() => {})

  // 7. Audit event
  await prisma.activityLog.create({
    data: {
      staffId:   null,
      staffName: 'Jade AI',
      action:    'Jade Human Handoff',
      detail:    `conv ${conversationId} · ${def.label} · source=${source} · ${assignedAgentName ? `assigned to ${assignedAgentName}` : 'unassigned (queue)'}`,
    },
  }).catch((e: unknown) => console.error('[handoff] audit log error:', e))

  return { ok: true, alreadyRequested: false, assignedAgentName, category: def.key }
}

// ── UI state helper (shared by widget + portal; unit-tested) ──────────────────

export type SpeakToHumanControlState = 'speak_button' | 'human_active' | 'hidden'

/**
 * Pure state function for the floating control:
 *  - Jade-owned open chat → "Speak to a Human" button
 *  - human-owned chat     → "Human Support Active" pill (no handoff action)
 *  - chat closed          → hidden
 * Cancelling the selector performs NO transition — ownership stays with Jade.
 */
export function speakToHumanControlState(opts: { chatOpen: boolean; isHandedOff: boolean }): SpeakToHumanControlState {
  if (!opts.chatOpen) return 'hidden'
  return opts.isHandedOff ? 'human_active' : 'speak_button'
}
