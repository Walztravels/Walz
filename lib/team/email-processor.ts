/**
 * Walz Team Hub V1.1 — the email notification PROCESSOR.
 *
 * Drained by /api/cron/team-email-notifications (Vercel Cron, every 5
 * minutes). One tick:
 *
 *   1. scan PENDING candidates whose debounce window has elapsed (bounded),
 *   2. drop any staff member inside their 15-minute cooldown — their
 *      candidates stay PENDING and roll into the next eligible tick,
 *   3. RE-CHECK every remaining candidate against live state (staff still
 *      active, preference still on, still a member, message still exists
 *      and still unread, call still shows MISSED) and CANCEL the ones that
 *      have gone stale,
 *   4. resolve the mention-beats-thread-reply collision,
 *   5. batch each staff member's surviving candidates into ONE email,
 *   6. mark them SENT (or FAILED, with bounded retries).
 *
 * IDEMPOTENCY. Candidates are CLAIMED (PENDING → SENDING, conditional
 * updateMany) before the send, and only a claim that actually won moves on
 * to sending. Running this twice over the same data therefore cannot
 * double-email: the second run finds nothing PENDING, and the cooldown
 * blocks the staff member anyway. The deliberate bias is toward
 * never-double-sending: if the process dies between claim and send, the
 * candidate stays SENDING and is never retried (one lost email, never a
 * duplicate) — see the honest-limitations note in the release report.
 *
 * PERFORMANCE. Every lookup is a batched findMany over an id list (no
 * per-candidate query), every scan predicate is index-backed
 * (status+scheduledSendAt, staffId+status+scheduledSendAt,
 * staffId+status+sentAt), and the tick bounds its own work with explicit
 * LIMITs rather than draining an unbounded backlog.
 *
 * OBSERVABILITY. Metadata only — staffId, kind, candidateId, counts,
 * timestamps, cancel reasons. Never message bodies, never email addresses,
 * never secrets.
 */

import prisma from '@/lib/db'
import { sendTeamHubEmail, type TeamHubEmailEvent } from '@/lib/email-team-notification'
import { DEFAULT_TEAM_EMAIL_PREFERENCES, isKindEnabled, loadTeamEmailPreferences, type TeamEmailKind } from '@/lib/team/email-notify'

/** No staff member receives two Team Hub emails inside this window. */
export const EMAIL_COOLDOWN_MS = 15 * 60_000
/** Upper bound on candidates examined per tick (a backlog drains over several ticks). */
export const MAX_CANDIDATES_PER_TICK = 200
/** Upper bound on emails sent per tick. */
export const MAX_STAFF_PER_TICK = 25
/** Events rendered in one email; the rest are summarised as "+N more". */
export const MAX_EVENTS_PER_EMAIL = 8
/** After this many failed sends a candidate is parked as FAILED, never retried. */
export const MAX_SEND_ATTEMPTS = 3
/** How long a failed candidate waits before the next attempt. */
export const RETRY_BACKOFF_MS = 5 * 60_000

const PREVIEW_MAX = 140

export type CancelReason =
  | 'staff_inactive'
  | 'preference_off'
  | 'not_member'
  | 'conversation_gone'
  | 'message_deleted'
  | 'already_read'
  | 'call_not_missed'
  | 'superseded_by_mention'
  | 'unknown_kind'

export interface ProcessSummary {
  scanned: number
  staffConsidered: number
  staffInCooldown: number
  staffDeferredForCapacity: number
  emailsSent: number
  candidatesSent: number
  candidatesCancelled: number
  candidatesFailed: number
}

interface CandidateRow {
  id: string
  staffId: string
  kind: string
  conversationId: string
  sourceId: string
  actorName: string | null
  eventAt: Date
  attempts: number
}

function truncate(text: string, max: number): string {
  const trimmed = (text ?? '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

/** The one place an event's human wording is composed (used by the email template). */
export function composeEventTitle(
  kind: TeamEmailKind,
  actorName: string | null,
  conversationName: string | null,
): string {
  const actor = actorName?.trim() || 'A teammate'
  const where = conversationName?.trim() ? ` in ${conversationName.trim()}` : ''
  switch (kind) {
    case 'DM': return `${actor} sent you a direct message`
    case 'MENTION': return `${actor} mentioned you${where}`
    case 'THREAD_REPLY': return `${actor} replied to your message${where}`
    case 'MISSED_CALL': return `Missed call from ${actor}`
    case 'INVITE': return `${actor} added you to ${conversationName?.trim() || 'a conversation'}`
    default: return `New Team Hub activity${where}`
  }
}

export async function processTeamEmailNotifications(now: Date = new Date()): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    scanned: 0, staffConsidered: 0, staffInCooldown: 0, staffDeferredForCapacity: 0,
    emailsSent: 0, candidatesSent: 0, candidatesCancelled: 0, candidatesFailed: 0,
  }

  // ── 1. Due, un-superseded candidates (bounded, index-backed) ────────────
  const pending: CandidateRow[] = await prisma.teamEmailNotificationCandidate.findMany({
    where: { status: 'PENDING', scheduledSendAt: { lte: now } },
    orderBy: { scheduledSendAt: 'asc' },
    take: MAX_CANDIDATES_PER_TICK,
    select: {
      id: true, staffId: true, kind: true, conversationId: true,
      sourceId: true, actorName: true, eventAt: true, attempts: true,
    },
  })
  summary.scanned = pending.length
  if (pending.length === 0) return summary

  const byStaff = new Map<string, CandidateRow[]>()
  for (const c of pending) {
    const list = byStaff.get(c.staffId)
    if (list) list.push(c)
    else byStaff.set(c.staffId, [c])
  }

  // ── 2. Per-staff cooldown — emailed in the last 15 minutes? ─────────────
  const cooldownSince = new Date(now.getTime() - EMAIL_COOLDOWN_MS)
  const recentlyEmailed = await prisma.teamEmailNotificationCandidate.findMany({
    where: { staffId: { in: Array.from(byStaff.keys()) }, status: 'SENT', sentAt: { gte: cooldownSince } },
    select: { staffId: true },
    distinct: ['staffId'],
  })
  for (const r of recentlyEmailed) {
    if (byStaff.delete(r.staffId)) summary.staffInCooldown += 1
  }

  // ── Capacity bound — the rest keep their PENDING rows for the next tick ─
  let groups = Array.from(byStaff.entries())
  if (groups.length > MAX_STAFF_PER_TICK) {
    summary.staffDeferredForCapacity = groups.length - MAX_STAFF_PER_TICK
    groups = groups.slice(0, MAX_STAFF_PER_TICK)
  }
  summary.staffConsidered = groups.length
  if (groups.length === 0) {
    console.info(`[team/email-cron] scanned=${summary.scanned} cooldown=${summary.staffInCooldown} sent=0`)
    return summary
  }

  const candidates = groups.flatMap(([, list]) => list)
  const staffIds = uniq(candidates.map(c => c.staffId))
  const conversationIds = uniq(candidates.map(c => c.conversationId))
  const messageIds = uniq(candidates.filter(c => c.kind === 'DM' || c.kind === 'MENTION' || c.kind === 'THREAD_REPLY').map(c => c.sourceId))
  const callIds = uniq(candidates.filter(c => c.kind === 'MISSED_CALL').map(c => c.sourceId))

  // ── 3. Batched live-state loads (no N+1: one query per entity type) ─────
  const [staffRows, prefs, conversations, memberships, messages, calls] = await Promise.all([
    prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true, isActive: true } }),
    loadTeamEmailPreferences(staffIds),
    prisma.teamConversation.findMany({ where: { id: { in: conversationIds } }, select: { id: true, type: true, name: true } }),
    prisma.teamConversationMember.findMany({
      where: { conversationId: { in: conversationIds }, staffId: { in: staffIds }, leftAt: null },
      select: { conversationId: true, staffId: true, lastReadAt: true },
    }),
    messageIds.length > 0
      ? prisma.teamMessage.findMany({
          where: { id: { in: messageIds } },
          select: { id: true, conversationId: true, body: true, createdAt: true, deletedAt: true, author: { select: { name: true } } },
        })
      : Promise.resolve([] as Array<{ id: string; conversationId: string; body: string; createdAt: Date; deletedAt: Date | null; author: { name: string } | null }>),
    callIds.length > 0
      ? prisma.teamCallRecord.findMany({
          where: { id: { in: callIds } },
          select: { id: true, status: true, caller: { select: { name: true } } },
        })
      : Promise.resolve([] as Array<{ id: string; status: string; caller: { name: string } | null }>),
  ])

  const staffById = new Map(staffRows.map(s => [s.id, s]))
  const conversationById = new Map(conversations.map(c => [c.id, c]))
  const membershipByKey = new Map(memberships.map(m => [`${m.conversationId}:${m.staffId}`, m]))
  const messageById = new Map(messages.map(m => [m.id, m]))
  const callById = new Map(calls.map(c => [c.id, c]))

  // ── 4. Re-check every candidate against live state ──────────────────────
  const cancels = new Map<CancelReason, string[]>()
  const cancel = (id: string, reason: CancelReason) => {
    const list = cancels.get(reason)
    if (list) list.push(id)
    else cancels.set(reason, [id])
  }

  interface ValidCandidate { row: CandidateRow; event: TeamHubEmailEvent }
  const validByStaff = new Map<string, ValidCandidate[]>()

  for (const c of candidates) {
    const kind = c.kind as TeamEmailKind
    const staff = staffById.get(c.staffId)
    if (!staff || !staff.isActive || !staff.email) { cancel(c.id, 'staff_inactive'); continue }
    if (!isKindEnabled(prefs.get(c.staffId) ?? DEFAULT_TEAM_EMAIL_PREFERENCES, kind)) { cancel(c.id, 'preference_off'); continue }

    const membership = membershipByKey.get(`${c.conversationId}:${c.staffId}`)
    if (!membership) { cancel(c.id, 'not_member'); continue }

    const conversation = conversationById.get(c.conversationId)
    if (!conversation) { cancel(c.id, 'conversation_gone'); continue }
    const conversationName = conversation.type === 'DM' ? null : conversation.name

    let preview: string | null = null
    let actorName = c.actorName

    if (kind === 'DM' || kind === 'MENTION' || kind === 'THREAD_REPLY') {
      const message = messageById.get(c.sourceId)
      // Deleted (tombstoned) or vanished → nothing to notify about.
      if (!message || message.deletedAt) { cancel(c.id, 'message_deleted'); continue }
      // The authoritative read check: TeamConversationMember.lastReadAt.
      if (membership.lastReadAt && membership.lastReadAt >= message.createdAt) { cancel(c.id, 'already_read'); continue }
      preview = truncate(message.body, PREVIEW_MAX)
      actorName = actorName ?? message.author?.name ?? null
    } else if (kind === 'MISSED_CALL') {
      const call = callById.get(c.sourceId)
      // ONLY the authoritative TeamCallRecord status counts — if the record
      // is gone, or has since moved off 'MISSED' (e.g. a late ANSWERED),
      // there is no missed call to report.
      if (!call || call.status !== 'MISSED') { cancel(c.id, 'call_not_missed'); continue }
      actorName = actorName ?? call.caller?.name ?? null
    } else if (kind === 'INVITE') {
      // They've opened the conversation since being added — they know.
      if (membership.lastReadAt && membership.lastReadAt >= c.eventAt) { cancel(c.id, 'already_read'); continue }
    } else {
      // Unknown kind — in practice unreachable, since chk_team_email_candidates_kind
      // constrains `kind` in Postgres to the 5 known values. Kept as a
      // defensive branch (e.g. a row written by a newer deploy against an
      // older, not-yet-migrated database) rather than emailing something
      // we cannot describe.
      cancel(c.id, 'unknown_kind')
      continue
    }

    const entry: ValidCandidate = {
      row: c,
      event: {
        kind,
        conversationId: c.conversationId,
        title: composeEventTitle(kind, actorName, conversationName),
        preview,
      },
    }
    const list = validByStaff.get(c.staffId)
    if (list) list.push(entry)
    else validByStaff.set(c.staffId, [entry])
  }

  // ── 5. Mention beats thread reply for the SAME message ──────────────────
  // Belt-and-braces: lib/team/email-notify.ts already refuses to create the
  // thread-reply candidate when a mention exists on the same message, so
  // this only fires for rows created by two separate calls (e.g. a mention
  // added by a later edit path). Either way, exactly one email line.
  for (const [staffId, list] of validByStaff) {
    const mentioned = new Set(list.filter(v => v.event.kind === 'MENTION').map(v => v.row.sourceId))
    if (mentioned.size === 0) continue
    const kept: ValidCandidate[] = []
    for (const v of list) {
      if (v.event.kind === 'THREAD_REPLY' && mentioned.has(v.row.sourceId)) {
        cancel(v.row.id, 'superseded_by_mention')
      } else {
        kept.push(v)
      }
    }
    validByStaff.set(staffId, kept)
  }

  // ── 6. Apply cancellations (idempotent: only ever PENDING → CANCELLED) ──
  for (const [reason, ids] of cancels) {
    try {
      const res = await prisma.teamEmailNotificationCandidate.updateMany({
        where: { id: { in: ids }, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelReason: reason, resolvedAt: now },
      })
      summary.candidatesCancelled += res.count
      console.info(`[team/email-cron] cancelled reason=${reason} count=${res.count}`)
    } catch (e) {
      console.warn(`[team/email-cron] cancel batch failed reason=${reason} count=${ids.length}:`, (e as Error)?.message)
    }
  }

  // ── 7. One batched email per staff member ───────────────────────────────
  for (const [staffId, list] of validByStaff) {
    if (list.length === 0) continue
    const staff = staffById.get(staffId)
    if (!staff) continue

    const ordered = [...list].sort((a, b) => a.row.eventAt.getTime() - b.row.eventAt.getTime())
    const ids = ordered.map(v => v.row.id)

    // Optimistic claim — the guard that makes a second, overlapping run
    // (or a retried cron invocation) unable to send the same batch twice.
    let claimed = 0
    try {
      const res = await prisma.teamEmailNotificationCandidate.updateMany({
        where: { id: { in: ids }, status: 'PENDING' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      })
      claimed = res.count
    } catch (e) {
      console.warn(`[team/email-cron] claim failed staffId=${staffId} count=${ids.length}:`, (e as Error)?.message)
      continue
    }
    if (claimed === 0) {
      console.info(`[team/email-cron] claim lost staffId=${staffId} count=${ids.length}`)
      continue
    }

    const events = ordered.slice(0, MAX_EVENTS_PER_EMAIL).map(v => v.event)
    const moreCount = Math.max(0, ordered.length - MAX_EVENTS_PER_EMAIL)
    const ok = await sendTeamHubEmail({
      staffId,
      staffName: staff.name,
      staffEmail: staff.email,
      events,
      moreCount,
    })

    if (ok) {
      try {
        const res = await prisma.teamEmailNotificationCandidate.updateMany({
          where: { id: { in: ids }, status: 'SENDING' },
          data: { status: 'SENT', sentAt: now, resolvedAt: now },
        })
        summary.candidatesSent += res.count
      } catch (e) {
        console.warn(`[team/email-cron] mark-sent failed staffId=${staffId}:`, (e as Error)?.message)
      }
      summary.emailsSent += 1
      continue
    }

    // Send failed — park exhausted candidates as FAILED, requeue the rest
    // with a backoff so a transient Resend error doesn't lose the event.
    const exhausted = ordered.filter(v => v.row.attempts + 1 >= MAX_SEND_ATTEMPTS).map(v => v.row.id)
    const retryable = ordered.filter(v => v.row.attempts + 1 < MAX_SEND_ATTEMPTS).map(v => v.row.id)
    try {
      if (exhausted.length > 0) {
        const res = await prisma.teamEmailNotificationCandidate.updateMany({
          where: { id: { in: exhausted }, status: 'SENDING' },
          data: { status: 'FAILED', resolvedAt: now },
        })
        summary.candidatesFailed += res.count
      }
      if (retryable.length > 0) {
        await prisma.teamEmailNotificationCandidate.updateMany({
          where: { id: { in: retryable }, status: 'SENDING' },
          data: { status: 'PENDING', scheduledSendAt: new Date(now.getTime() + RETRY_BACKOFF_MS) },
        })
      }
    } catch (e) {
      console.warn(`[team/email-cron] failure bookkeeping failed staffId=${staffId}:`, (e as Error)?.message)
    }
    console.warn(`[team/email-cron] send failed staffId=${staffId} events=${events.length} retryable=${retryable.length} failed=${exhausted.length}`)
  }

  console.info(
    `[team/email-cron] scanned=${summary.scanned} staff=${summary.staffConsidered} cooldown=${summary.staffInCooldown} ` +
    `deferred=${summary.staffDeferredForCapacity} emails=${summary.emailsSent} sent=${summary.candidatesSent} ` +
    `cancelled=${summary.candidatesCancelled} failed=${summary.candidatesFailed}`,
  )
  return summary
}
