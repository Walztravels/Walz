/**
 * Inbox SLA Escalation System (INBOX-SLA-1).
 *
 * ADDITIVE to the existing app/api/cron/routing-escalation/route.ts cron —
 * this module does NOT replace or alter the existing 30-minute
 * "reassign to an eligible escalation agent" behavior. It runs
 * independently, driven by the SAME cron tick, and answers a different
 * question: not "has ConversationRoute.status flipped", but "has a real,
 * public, staff-authored reply actually landed since the customer's last
 * message" — the exact gap the routing-side status/assignedAt fields can't
 * answer (ConversationRoute.assignedAt only reflects when the conversation
 * was FIRST auto-routed, and the legacy 30-minute logic flips `status` to
 * 'escalated' regardless of whether a human ever replied).
 *
 * UNATTENDED definition (spec): no message with message_type===1
 * (outgoing) AND private===false, after the latest customer message
 * (message_type===0). A private note never counts as a customer-facing
 * reply — this mirrors the exact contract app/api/admin/conversations/[id]/
 * reply/route.ts already uses (parsePrivateFlag + message_type 'outgoing').
 *
 * STATE MACHINE — 6 new nullable, additive columns on ConversationRoute
 * (prisma/migrations/inbox_sla_escalation_columns.sql):
 *   firstUnattendedAt     anchor (= latest customer message time) of the
 *                         CURRENT unattended episode. Recomputed from live
 *                         Chatwoot data every tick, so it never drifts.
 *   agentReminderSentAt   Level 1 (30min) idempotency gate + evidence
 *   managerEscalatedAt    Level 2 (60min)   "
 *   adminEscalatedAt      Level 3 (90min)   "
 *   criticalEscalatedAt   Level 4 (120min)  "
 *   escalationResolvedAt  set when a real reply lands (or Chatwoot itself
 *                         reports the conversation resolved) — stops all
 *                         further stages for the CURRENT episode.
 *
 * EPISODES: a ConversationRoute row is reused for the lifetime of one
 * Chatwoot conversation assignment (router.ts upserts by
 * chatwootConversationId), so more than one unattended "episode" can occur
 * against the same row (customer message → staff reply → customer message
 * again, all without ever being reassigned). A fresh episode is detected
 * by comparing the freshly-fetched last-customer-message time against the
 * stored firstUnattendedAt: when it's newer, the four stage columns and
 * escalationResolvedAt are reset so the new episode gets fresh
 * notifications — evidence of the PRIOR episode's escalations is not
 * needed post-resolution (this row is 1:1 live state, same as
 * assignedAt/status already being overwritten on every re-route; it is not
 * the ConversationClientLink-style append-only identity ledger).
 *
 * RESOLUTION IS PERMANENT UNTIL THE NEXT CUSTOMER MESSAGE (deliberate, not
 * a bug): attendedByReply is recomputed from the full message history every
 * tick with no time decay, so once a real staff reply lands after the
 * latest customer message, `attended` stays true on every subsequent tick
 * — even if the agent then goes silent again — until the customer writes
 * something new. This matches the spec's own wording ("a staff response
 * ... resets/resolves the escalation cycle"): one genuine reply resolves
 * the CURRENT episode outright rather than pausing a countdown that could
 * silently resume. The tradeoff: an agent who replies once and then
 * abandons the conversation is not re-escalated on a timer — only a fresh
 * customer message starts a new episode. Accepted for V1.
 *
 * IDEMPOTENCY: two independent layers —
 *   1. the stage column itself gates re-processing within the cron loop
 *      (checked BEFORE any side effect for that stage);
 *   2. createStaffNotification's sourceId dedup
 *      (`sla:<stage>:<conversationId>:<episode-anchor-ms>`) is a second,
 *      belt-and-suspenders guard in case the column write is ever lost.
 * A stage column is set ONLY when at least one in-app notification
 * actually succeeded (or there were zero eligible recipients at all, which
 * is treated as a safe terminal no-op so the cron doesn't retry a
 * situation that won't change on its own) — never on notification
 * *failure*, so a transient createStaffNotification error simply retries
 * on the next 5-minute tick instead of being falsely marked "done". Email
 * is a best-effort side channel and NEVER affects this gate either way.
 *
 * DECISION — existing 30-minute Chatwoot note vs. new Level 1: the legacy
 * cron already posts a client-thread-visible private note at 30 minutes
 * ("⚠️ Escalation: ... Originally assigned to X") and reassigns to an
 * eligible escalation agent. That note is treated as ALREADY satisfying
 * "Level 1 observable in the client thread" — this module's Level 1 stage
 * therefore posts NO additional Chatwoot note (see SLA_STAGES,
 * postsChatwootNote:false for level 1) and only adds a NEW, staff-facing
 * in-app notification + best-effort email reminder. Levels 2/3/4 (60/90/
 * 120min) have no legacy equivalent, so they each post their own new,
 * level-specific private note.
 *
 * BUSINESS HOURS: none. V1 runs continuously 24/7 — there is no reusable
 * staff-hours source in this codebase (lib/config/support-hours.ts is an
 * unresolved, client-facing placeholder) — documented, not implemented.
 *
 * Never logs message content, passport numbers, or other sensitive data —
 * only conversation id, staff email/name, level, and timestamps.
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'
import { createStaffNotification } from '@/lib/notifications/staff'
import { getResend } from '@/lib/email-internal'
import { botChatwootOrNull, logChatwootUnconfigured, type ChatwootConfig } from '@/lib/chatwoot/config'
import { isAutoAssignable } from '@/lib/inbox/assignable'

const LOG = '[cron:sla-escalation]'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatwootMessage {
  id?: number
  message_type: number // 0 incoming (customer), 1 outgoing (staff), 2 activity
  private?: boolean
  created_at: number // Chatwoot sends unix seconds (occasionally ms) — see toMs()
}

export interface ConversationRouteRow {
  id: string
  chatwootConversationId: string
  assignedTo: string
  assignedToName: string
  assignedAt: string
  status: string
  firstUnattendedAt: string | null
  agentReminderSentAt: string | null
  managerEscalatedAt: string | null
  adminEscalatedAt: string | null
  criticalEscalatedAt: string | null
  escalationResolvedAt: string | null
}

export interface StaffLite {
  id: string
  name: string
  email: string
  isActive: boolean
  chatwootAgentId: number | null
  managerId: string | null
  role: string
}

const STAFF_SELECT = {
  id: true, name: true, email: true, isActive: true, chatwootAgentId: true, managerId: true, role: true,
} as const

// ── Pure helpers (exported for tests) ───────────────────────────────────────

export function toMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000
}

export interface AttendanceResult {
  lastCustomerMsgAt: number | null
  lastRealStaffReplyAt: number | null
  attendedByReply: boolean
}

/**
 * "Unattended" per spec: no message with message_type===1 (outgoing) AND
 * private===false, after the latest customer message (message_type===0).
 * A private note (message_type 1, private:true) never counts.
 */
export function computeAttendance(messages: ChatwootMessage[] | null | undefined): AttendanceResult {
  let lastCustomerMsgAt: number | null = null
  let lastRealStaffReplyAt: number | null = null
  for (const m of messages ?? []) {
    if (!m || typeof m.created_at !== 'number') continue
    const ms = toMs(m.created_at)
    if (m.message_type === 0) {
      if (lastCustomerMsgAt == null || ms > lastCustomerMsgAt) lastCustomerMsgAt = ms
    } else if (m.message_type === 1 && m.private !== true) {
      if (lastRealStaffReplyAt == null || ms > lastRealStaffReplyAt) lastRealStaffReplyAt = ms
    }
  }
  const attendedByReply =
    lastCustomerMsgAt != null && lastRealStaffReplyAt != null && lastRealStaffReplyAt > lastCustomerMsgAt
  return { lastCustomerMsgAt, lastRealStaffReplyAt, attendedByReply }
}

/**
 * Staff eligible to receive an AUTOMATIC SLA notification: active, and —
 * when a Chatwoot agent id is present — not one of the explicit
 * non-routable identities (Michael/Jade, via lib/inbox/assignable.ts).
 * Staff with no Chatwoot agent id at all (e.g. finance-only accounts) are
 * still notifiable; they simply aren't Chatwoot-assignable.
 */
export function isRoutableStaff(
  staff: Pick<StaffLite, 'isActive' | 'chatwootAgentId'> | null | undefined,
): boolean {
  if (!staff) return false
  if (!staff.isActive) return false
  if (staff.chatwootAgentId == null) return true
  return isAutoAssignable(staff.chatwootAgentId)
}

function dedupeStaff(list: StaffLite[]): StaffLite[] {
  const seen = new Set<string>()
  const out: StaffLite[] = []
  for (const s of list) {
    if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s) }
  }
  return out
}

// ── Staff resolution ─────────────────────────────────────────────────────────

const MANAGER_FALLBACK_ROLES = ['general_manager', 'senior_manager']

/**
 * Manager resolution (item 5): Staff.managerId when present AND routable;
 * otherwise falls back to role-based recipients — mirrors the pattern in
 * app/api/trip-request/[token]/route.ts (queried against the Staff model,
 * NOT StaffMember, which is payroll-only and has no chatwootAgentId/
 * managerId).
 */
export async function resolveManagerRecipients(agentStaff: StaffLite | null): Promise<StaffLite[]> {
  if (agentStaff?.managerId) {
    const mgr = await prisma.staff.findUnique({ where: { id: agentStaff.managerId }, select: STAFF_SELECT })
    if (isRoutableStaff(mgr)) return [mgr as StaffLite]
    // Manager row exists but is inactive/non-routable — fall through to
    // the role-based pool rather than notifying nobody.
  }
  const roleBased = await prisma.staff.findMany({
    where:  { role: { in: MANAGER_FALLBACK_ROLES } },
    select: STAFF_SELECT,
  })
  return (roleBased as StaffLite[]).filter(isRoutableStaff)
}

/**
 * Level-3 "escalation group": the same RoutingAgent.isEscalation pool the
 * legacy 30-minute reassignment already uses, matched to Staff by email so
 * they can receive an in-app StaffNotification (RoutingAgent has no direct
 * FK to Staff).
 */
export async function resolveEscalationGroupRecipients(): Promise<StaffLite[]> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('RoutingAgent')
      .select('email')
      .eq('isEscalation', true)
      .eq('active', true)
    const emails = Array.from(
      new Set((data ?? []).map((r: { email?: string }) => r.email).filter(Boolean)),
    ) as string[]
    if (!emails.length) return []
    const staff = await prisma.staff.findMany({ where: { email: { in: emails } }, select: STAFF_SELECT })
    return (staff as StaffLite[]).filter(isRoutableStaff)
  } catch {
    return []
  }
}

/** Level-4 "critical": all active, routable super admins. */
export async function resolveCriticalRecipients(): Promise<StaffLite[]> {
  const admins = await prisma.staff.findMany({ where: { role: 'super_admin' }, select: STAFF_SELECT })
  return (admins as StaffLite[]).filter(isRoutableStaff)
}

/**
 * The CURRENTLY assigned agent — resolved from Chatwoot's live assignee id,
 * NOT from ConversationRoute.assignedTo/assignedToName. The legacy
 * 30-minute logic reassigns the conversation IN Chatwoot but never updates
 * this row, so those fields can go stale the moment an escalation
 * reassignment happens. Falls back to the originally-recorded RoutingAgent
 * only when the live Chatwoot lookup is unavailable.
 */
export async function resolveAgentStaff(
  route: Pick<ConversationRouteRow, 'assignedTo'>,
  chatwootAssigneeId: number | null,
): Promise<StaffLite | null> {
  if (chatwootAssigneeId) {
    const staff = await prisma.staff.findFirst({ where: { chatwootAgentId: chatwootAssigneeId }, select: STAFF_SELECT })
    if (staff) return staff as StaffLite
  }
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from('RoutingAgent').select('email').eq('id', route.assignedTo).maybeSingle()
    if (data?.email) {
      const staff = await prisma.staff.findFirst({ where: { email: data.email }, select: STAFF_SELECT })
      if (staff) return staff as StaffLite
    }
  } catch { /* falls through to null — caller degrades to route.assignedToName for display only */ }
  return null
}

export async function recipientsForLevel(
  level: 1 | 2 | 3 | 4,
  agentStaff: StaffLite | null,
): Promise<StaffLite[]> {
  let list: StaffLite[] = []
  if (agentStaff && isRoutableStaff(agentStaff)) list = [agentStaff]
  if (level >= 2) list = list.concat(await resolveManagerRecipients(agentStaff))
  if (level >= 3) list = list.concat(await resolveEscalationGroupRecipients())
  if (level >= 4) list = list.concat(await resolveCriticalRecipients())
  return dedupeStaff(list)
}

// ── Stage configuration ──────────────────────────────────────────────────────

export interface StageConfig {
  level: 1 | 2 | 3 | 4
  minutes: number
  column: 'agentReminderSentAt' | 'managerEscalatedAt' | 'adminEscalatedAt' | 'criticalEscalatedAt'
  slug: string
  signal: string
  category: 'SYSTEM' | 'MANAGEMENT'
  postsChatwootNote: boolean
}

export const SLA_STAGES: StageConfig[] = [
  { level: 1, minutes: 30,  column: 'agentReminderSentAt', slug: 'agent-reminder', signal: 'SLA_AGENT_REMINDER_SENT', category: 'SYSTEM',     postsChatwootNote: false },
  { level: 2, minutes: 60,  column: 'managerEscalatedAt',  slug: 'manager',        signal: 'SLA_MANAGER_ESCALATED',   category: 'MANAGEMENT', postsChatwootNote: true  },
  { level: 3, minutes: 90,  column: 'adminEscalatedAt',    slug: 'admin',          signal: 'SLA_ADMIN_ESCALATED',     category: 'MANAGEMENT', postsChatwootNote: true  },
  { level: 4, minutes: 120, column: 'criticalEscalatedAt', slug: 'critical',       signal: 'SLA_ADMIN_ESCALATED',     category: 'MANAGEMENT', postsChatwootNote: true  },
]

// ── Chatwoot helpers ─────────────────────────────────────────────────────────

async function fetchMessages(cw: ChatwootConfig, conversationId: string): Promise<ChatwootMessage[] | null> {
  try {
    const res = await fetch(
      `${cw.base}/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/messages`,
      { headers: { api_access_token: cw.token }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const raw = await res.json().catch(() => null) as unknown
    const body = (raw as { data?: unknown })?.data ?? raw
    const payload = (body as { payload?: unknown })?.payload
    return Array.isArray(payload) ? (payload as ChatwootMessage[]) : null
  } catch {
    return null
  }
}

async function fetchConversationMeta(
  cw: ChatwootConfig,
  conversationId: string,
): Promise<{ status: string | null; assigneeId: number | null } | null> {
  try {
    const res = await fetch(
      `${cw.base}/api/v1/accounts/${cw.accountId}/conversations/${conversationId}`,
      { headers: { api_access_token: cw.token }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const raw = await res.json().catch(() => null) as {
      status?: unknown
      meta?: { assignee?: { id?: number } | null }
      assignee?: { id?: number } | null
    } | null
    const assigneeId = raw?.meta?.assignee?.id ?? raw?.assignee?.id ?? null
    const status = typeof raw?.status === 'string' ? raw.status : null
    return { status, assigneeId: assigneeId ?? null }
  } catch {
    return null
  }
}

async function postPrivateNote(cw: ChatwootConfig, conversationId: string, content: string): Promise<void> {
  try {
    await fetch(
      `${cw.base}/api/v1/accounts/${cw.accountId}/conversations/${conversationId}/messages`,
      {
        method:  'POST',
        headers: { api_access_token: cw.token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content, message_type: 2, private: true }),
      },
    )
  } catch {
    console.warn(`${LOG} PRIVATE_NOTE_FAILED conversation=${conversationId}`)
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function noteText(level: 2 | 3 | 4, conversationId: string, agentDisplayName: string, notifiedNames: string[]): string {
  const names = notifiedNames.length ? notifiedNames.join(', ') : 'the management team (none currently active)'
  if (level === 2) {
    return `⚠️ Escalation Level 2: Conversation #${conversationId} has remained unattended for 60 minutes. Assigned agent: ${agentDisplayName}. Manager ${names} has been notified.`
  }
  if (level === 3) {
    return `🚨 Escalation Level 3: Conversation #${conversationId} has remained unattended for 90 minutes. Assigned agent: ${agentDisplayName}. Escalation group notified: ${names}.`
  }
  return `🔴 Critical Escalation (Level 4): Conversation #${conversationId} has remained unattended for 120 minutes. Assigned agent: ${agentDisplayName}. Notified: ${names}.`
}

function emailHtml(opts: { staffName: string; conversationId: string; level: number; minutes: number; link: string }): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px">
<div style="background:#060f1e;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px">
<p style="color:#F59E0B;font-weight:900;font-size:16px;margin:0">⏱️ SLA Escalation — Level ${opts.level}</p>
</div>
<div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-bottom:16px">
<p style="margin:0 0 10px;color:#111">Hi ${escapeHtml(opts.staffName)},</p>
<p style="margin:0 0 10px;color:#333;font-size:14px">Conversation <strong>#${opts.conversationId}</strong> has been unattended for approximately <strong>${opts.minutes} minutes</strong>.</p>
</div>
<a href="${opts.link}" style="display:block;background:#F59E0B;color:#000;font-weight:900;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-size:14px">Open conversation →</a>
</div>`
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface SlaSweepResult {
  processed: number
  attendedResolved: number
  stagesFired: number
  errors: number
}

/**
 * Runs one SLA sweep tick. Candidates are ConversationRoute rows with
 * status IN ('active','escalated') — deliberately BOTH legacy statuses,
 * not just 'active': the existing 30-minute logic flips a row to
 * 'escalated' the moment it first crosses 30 minutes unattended, which is
 * exactly when this module needs to KEEP tracking it toward 60/90/120.
 * Filtering to status='active' only (as a literal reading of the original
 * persistence plan would suggest) would silently stop staged escalation
 * dead at the 30-minute mark for every conversation the legacy cron
 * touches — see the SLA_STAGES / episode-detection doc comment above for
 * why "unattended" is instead computed from live Chatwoot message history,
 * decoupled from that legacy status field entirely.
 *
 * KNOWN FOLLOW-UP (accepted for V1, not mitigated here): the candidate
 * query below has no .limit()/pagination, and no ConversationRoute code
 * path anywhere in this codebase ever writes a terminal 'resolved'/'closed'
 * status — only 'active' and 'escalated' exist — so the candidate set only
 * grows over time. There is also no cron-overlap guard (lock row/advisory
 * lock), so a slow tick could theoretically still be running when the next
 * 5-minute invocation fires (each recipient-resolution call is independent
 * and idempotent, so an overlap would be wasteful, not unsafe). Both are
 * near-term scale follow-ups, not correctness bugs at current volume.
 */
export async function runSlaEscalationSweep(opts?: { nowMs?: number }): Promise<SlaSweepResult> {
  const nowMs = opts?.nowMs ?? Date.now()
  const result: SlaSweepResult = { processed: 0, attendedResolved: 0, stagesFired: 0, errors: 0 }

  const cw = botChatwootOrNull()
  if (!cw) {
    logChatwootUnconfigured('sla-escalation')
    return result
  }

  const supabase = getSupabaseAdmin()
  const { data: routes, error } = await supabase
    .from('ConversationRoute')
    .select(
      'id, chatwootConversationId, assignedTo, assignedToName, assignedAt, status, ' +
      'firstUnattendedAt, agentReminderSentAt, managerEscalatedAt, adminEscalatedAt, ' +
      'criticalEscalatedAt, escalationResolvedAt',
    )
    .in('status', ['active', 'escalated'])

  if (error) {
    console.error(`${LOG} Failed to load candidate routes:`, error)
    return result
  }

  for (const route of (routes ?? []) as unknown as ConversationRouteRow[]) {
    try {
      await processRoute(route, cw, nowMs, result)
      result.processed++
    } catch (e) {
      result.errors++
      console.error(`${LOG} Error processing conversation ${route.chatwootConversationId}:`, e)
    }
  }

  return result
}

async function processRoute(
  route: ConversationRouteRow,
  cw: ChatwootConfig,
  nowMs: number,
  result: SlaSweepResult,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const conversationId = route.chatwootConversationId

  const [messages, meta] = await Promise.all([
    fetchMessages(cw, conversationId),
    fetchConversationMeta(cw, conversationId),
  ])
  if (!messages) return // Chatwoot unreachable this tick — retry next tick, never guess

  const { lastCustomerMsgAt, attendedByReply } = computeAttendance(messages)
  if (lastCustomerMsgAt == null) return // nothing to measure yet

  const attended = attendedByReply || meta?.status === 'resolved'

  if (attended) {
    if (!route.escalationResolvedAt) {
      const nowIso = new Date(nowMs).toISOString()
      const { error } = await supabase
        .from('ConversationRoute')
        .update({ escalationResolvedAt: nowIso, firstUnattendedAt: null })
        .eq('id', route.id)
      if (!error) {
        result.attendedResolved++
        console.log(`${LOG} SLA_ESCALATION_RESOLVED conversation=${conversationId}`)
      }
    }
    return
  }

  // Unattended. A fresh episode is detected when the freshly-fetched last
  // customer message is newer than the stored anchor — either there was no
  // anchor yet, or a prior episode was resolved and the customer has since
  // written again on the same (still-assigned) conversation.
  const storedAnchorMs = route.firstUnattendedAt ? new Date(route.firstUnattendedAt).getTime() : null
  const isNewEpisode = storedAnchorMs == null || lastCustomerMsgAt > storedAnchorMs

  let working: ConversationRouteRow = route
  if (isNewEpisode) {
    const patch = {
      firstUnattendedAt:    new Date(lastCustomerMsgAt).toISOString(),
      escalationResolvedAt: null,
      agentReminderSentAt:  null,
      managerEscalatedAt:   null,
      adminEscalatedAt:     null,
      criticalEscalatedAt:  null,
    }
    await supabase.from('ConversationRoute').update(patch).eq('id', route.id)
    working = { ...route, ...patch }
  }

  const anchorMs = new Date(working.firstUnattendedAt as string).getTime()
  const durationMin = (nowMs - anchorMs) / 60000

  const agentStaff = await resolveAgentStaff(route, meta?.assigneeId ?? null)
  const agentDisplayName =
    (agentStaff && isRoutableStaff(agentStaff) ? agentStaff.name : null) ?? route.assignedToName ?? 'the assigned agent'

  for (const stage of SLA_STAGES) {
    if (working[stage.column]) continue // already sent for this episode
    if (durationMin < stage.minutes) continue

    const fired = await fireStage(stage, {
      conversationId,
      anchorMs,
      routeId: working.id,
      agentStaff,
      agentDisplayName,
      cw,
    })
    if (fired) {
      working = { ...working, [stage.column]: new Date().toISOString() }
      result.stagesFired++
    }
  }
}

async function fireStage(
  stage: StageConfig,
  ctx: {
    conversationId: string
    anchorMs: number
    routeId: string
    agentStaff: StaffLite | null
    agentDisplayName: string
    cw: ChatwootConfig
  },
): Promise<boolean> {
  const recipients = await recipientsForLevel(stage.level, ctx.agentStaff)
  const sourceId = `sla:${stage.slug}:${ctx.conversationId}:${ctx.anchorMs}`
  const link = `${BASE_URL}/admin/inbox?c=${ctx.conversationId}`

  let anyAttempted = false
  let allSucceeded = true

  for (const staff of recipients) {
    anyAttempted = true
    const title = stage.level === 1
      ? `Unattended conversation — #${ctx.conversationId}`
      : `SLA Escalation Level ${stage.level} — #${ctx.conversationId}`
    const body = `Conversation #${ctx.conversationId} (assigned: ${ctx.agentDisplayName}) has been unattended for ${stage.minutes}+ minutes.`
    const id = await createStaffNotification({
      staffId:    staff.id,
      category:   stage.category,
      title,
      body,
      important:  stage.level >= 2,
      sourceId,
      sourceType: 'sla_escalation',
      data:       { conversationId: ctx.conversationId, level: stage.level },
    }).catch(() => null)
    if (!id) allSucceeded = false
  }

  // Best-effort staff email — independent of in-app success/failure, and
  // NEVER allowed to affect the idempotency gate below.
  for (const staff of recipients) {
    if (!staff.email) continue
    try {
      const resend = getResend()
      await resend.emails.send({
        from:    'Walz Travels <hello@walztravels.com>',
        to:      staff.email,
        subject: `SLA Escalation (Level ${stage.level}) — Conversation #${ctx.conversationId} unattended ${stage.minutes}min`,
        html:    emailHtml({ staffName: staff.name, conversationId: ctx.conversationId, level: stage.level, minutes: stage.minutes, link }),
      })
    } catch {
      console.warn(`${LOG} EMAIL_SEND_FAILED conversation=${ctx.conversationId} level=${stage.level}`)
    }
  }

  if (stage.postsChatwootNote) {
    const notifiedNames = recipients.filter(r => r.id !== ctx.agentStaff?.id).map(r => r.name)
    await postPrivateNote(
      ctx.cw,
      ctx.conversationId,
      noteText(stage.level as 2 | 3 | 4, ctx.conversationId, ctx.agentDisplayName, notifiedNames),
    )
  }

  // Only mark the stage "sent" when EVERY attempted recipient has either
  // succeeded this tick or already has a notification row from an earlier
  // tick (createStaffNotification returns that row's existing id rather
  // than erroring, so re-checking it here is not a re-send) — otherwise a
  // single recipient's transient failure (e.g. the manager's create call
  // erroring while the agent's succeeds) would mark the whole stage "sent"
  // and the outer loop's `if (working[stage.column]) continue` gate would
  // then permanently skip retrying that recipient for this episode. An
  // empty recipient list is vacuously "all succeeded" — the safe, logged
  // terminal no-op case below.
  const shouldMarkSent = allSucceeded

  if (shouldMarkSent) {
    const supabase = getSupabaseAdmin()
    await supabase
      .from('ConversationRoute')
      .update({ [stage.column]: new Date().toISOString() })
      .eq('id', ctx.routeId)
    console.log(`${LOG} ${stage.signal} conversation=${ctx.conversationId} level=${stage.level} recipients=${recipients.length}`)
    if (!anyAttempted) {
      console.warn(`${LOG} NO_ELIGIBLE_RECIPIENTS conversation=${ctx.conversationId} level=${stage.level}`)
    }
  } else {
    console.warn(`${LOG} ${stage.signal}_RETRY conversation=${ctx.conversationId} level=${stage.level} — notification attempts failed, will retry next tick`)
  }

  return shouldMarkSent
}
