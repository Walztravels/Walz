/**
 * Walz Team Hub V1.1 — EMAIL notification scheduling.
 *
 * This file is the email counterpart of lib/team/notify.ts, and is
 * deliberately a SEPARATE module: lib/team/notify.ts (dashboard
 * StaffNotification rows) is committed, stable and NOT modified by this
 * feature. The same route handlers that already call notifyMention /
 * notifyThreadReply / notifyChannelInvite call the schedulers below
 * *alongside* those calls, each inside its own try/catch, so a failure to
 * schedule an email can never break the underlying Team Hub action
 * (sending a message, adding a member, ending a call).
 *
 * NOTHING HERE SENDS EMAIL. Sending is exclusively the job of the
 * /api/cron/team-email-notifications Vercel Cron (lib/team/email-processor.ts),
 * for three reasons:
 *   1. a debounce window has to elapse before we know whether the staff
 *      member actually missed the activity (they may read it in 20s),
 *   2. a burst of messages must collapse into ONE email, not N,
 *   3. serverless request handlers must not hold an in-request timer —
 *      Vercel Cron is this codebase's established mechanism for delayed,
 *      durable work (see vercel.json's existing `crons` array).
 *
 * All this module does is write a row to team_email_notification_candidates
 * ("a pending reason to maybe email this staff member"), whose
 * @@unique([staffId, sourceId, kind]) constraint is THIS feature's own
 * idempotency key — independent of StaffNotification's dedup mechanism,
 * which is not referenced, relied on, or modified anywhere in this feature.
 *
 * Scope, matching lib/team/notify.ts's own deliberate scope exactly:
 * ordinary top-level channel/group message activity is NEVER emailed and is
 * not an available preference toggle.
 */

import prisma from '@/lib/db'

export type TeamEmailKind = 'DM' | 'MENTION' | 'THREAD_REPLY' | 'MISSED_CALL' | 'INVITE'

/**
 * Debounce window — how long after an event we wait before an email is even
 * *considered*. 3 minutes sits in the middle of the ~2-5 minute product
 * target and pairs with the cron's five-minute cadence: a candidate
 * created at T is picked up by the tick at T+3..T+8, i.e. always at least
 * the full debounce, and never more than ~8 minutes late. Every further
 * message in that window collapses into the same email because the cron
 * batches ALL of a staff member's due candidates into one send.
 */
export const EMAIL_DEBOUNCE_MS = 3 * 60_000

/** All-on defaults — a staff member with no preference row receives everything. */
export interface TeamEmailPreferences {
  directMessages: boolean
  mentionsAndThreads: boolean
  missedCalls: boolean
  invites: boolean
}

export const DEFAULT_TEAM_EMAIL_PREFERENCES: TeamEmailPreferences = {
  directMessages: true,
  mentionsAndThreads: true,
  missedCalls: true,
  invites: true,
}

/** Which toggle governs which kind. Ordinary channel activity has no kind at all. */
export function isKindEnabled(prefs: TeamEmailPreferences, kind: TeamEmailKind): boolean {
  switch (kind) {
    case 'DM': return prefs.directMessages
    case 'MENTION':
    case 'THREAD_REPLY': return prefs.mentionsAndThreads
    case 'MISSED_CALL': return prefs.missedCalls
    case 'INVITE': return prefs.invites
    default: return false
  }
}

/**
 * Preferences for a set of staff, defaulted. A missing row is NOT an
 * error and is never created on read — "no row" is the all-on default, so
 * this feature needs no backfill and no staff action to start working.
 */
export async function loadTeamEmailPreferences(staffIds: string[]): Promise<Map<string, TeamEmailPreferences>> {
  const map = new Map<string, TeamEmailPreferences>()
  const unique = Array.from(new Set(staffIds.filter(Boolean)))
  for (const id of unique) map.set(id, { ...DEFAULT_TEAM_EMAIL_PREFERENCES })
  if (unique.length === 0) return map

  const rows = await prisma.teamEmailNotificationPreference.findMany({
    where: { staffId: { in: unique } },
    select: { staffId: true, directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true },
  })
  for (const r of rows) {
    map.set(r.staffId, {
      directMessages: r.directMessages,
      mentionsAndThreads: r.mentionsAndThreads,
      missedCalls: r.missedCalls,
      invites: r.invites,
    })
  }
  return map
}

interface CandidateSpec {
  staffId: string
  kind: TeamEmailKind
  conversationId: string
  sourceId: string
  actorName: string | null
}

/**
 * Writes the candidate rows, one upsert each, keyed on this feature's own
 * unique constraint. `update: {}` is deliberate and load-bearing:
 *   - a retried request never re-arms the debounce (the ORIGINAL
 *     scheduledSendAt stands, so a burst still produces one email),
 *   - a candidate already SENT/CANCELLED is never resurrected into PENDING,
 *     so nobody is emailed twice for the same event.
 * Failures are logged (metadata only) and swallowed per candidate.
 */
async function writeCandidates(specs: CandidateSpec[], now: Date): Promise<void> {
  if (specs.length === 0) return
  const scheduledSendAt = new Date(now.getTime() + EMAIL_DEBOUNCE_MS)

  const results = await Promise.allSettled(specs.map(spec =>
    prisma.teamEmailNotificationCandidate.upsert({
      where: { staffId_sourceId_kind: { staffId: spec.staffId, sourceId: spec.sourceId, kind: spec.kind } },
      update: {},
      create: {
        staffId: spec.staffId,
        kind: spec.kind,
        conversationId: spec.conversationId,
        sourceId: spec.sourceId,
        actorName: spec.actorName,
        status: 'PENDING',
        scheduledSendAt,
        eventAt: now,
      },
      select: { id: true },
    }),
  ))

  results.forEach((r, i) => {
    const spec = specs[i]
    if (r.status === 'fulfilled') {
      // Metadata only — never message content, never email addresses.
      console.info(`[team/email-notify] candidate kind=${spec.kind} staffId=${spec.staffId} candidateId=${r.value.id} dueAt=${scheduledSendAt.toISOString()}`)
    } else {
      console.warn(`[team/email-notify] candidate write failed kind=${spec.kind} staffId=${spec.staffId}:`, r.reason)
    }
  })
}

export interface MessageEmailCandidatesInput {
  conversationId: string
  messageId: string
  /** Server-resolved author — never notified about their own message. */
  authorStaffId: string
  authorName: string
  /** Already membership-validated by the caller (same list it passes to notifyMention). */
  mentionedStaffIds: string[]
  /** Already membership-validated by the caller, or null if this isn't a thread reply. */
  threadParentAuthorId: string | null
}

/**
 * The single entry point for message-driven email candidates — DM,
 * @mention and thread-reply all resolved together, in ONE place, because
 * the product rule "a message that is both a mention AND a reply to you
 * produces exactly one email, worded as a mention" is a *priority* rule
 * that can only be applied where all three signals are visible at once.
 *
 * Priority: MENTION > THREAD_REPLY > DM. The losing kind's candidate is
 * never created at all (not created-then-cancelled), so the batched email
 * can never list the same message twice.
 *
 * Ordinary top-level channel/group messages produce NO candidate: the only
 * way a non-DM message yields one is by mentioning someone or replying in
 * their thread.
 */
export async function scheduleMessageEmailCandidates(input: MessageEmailCandidatesInput): Promise<void> {
  try {
    const now = new Date()
    const kindByStaffId = new Map<string, TeamEmailKind>()

    for (const id of new Set(input.mentionedStaffIds)) {
      if (id && id !== input.authorStaffId) kindByStaffId.set(id, 'MENTION')
    }
    if (input.threadParentAuthorId && input.threadParentAuthorId !== input.authorStaffId
        && !kindByStaffId.has(input.threadParentAuthorId)) {
      kindByStaffId.set(input.threadParentAuthorId, 'THREAD_REPLY')
    }

    // A DM's other participant(s) get a DM candidate for EVERY message —
    // that is the whole point of the DM rule ("you missed a direct
    // message") — but only where a higher-priority kind hasn't already
    // claimed them. Membership is read live here rather than trusted from
    // the caller, mirroring notifyCallStarted's own reasoning: a stale
    // member list must never schedule an email to someone who has left.
    const conversation = await prisma.teamConversation.findUnique({
      where: { id: input.conversationId },
      select: { type: true },
    })
    if (conversation?.type === 'DM') {
      const members = await prisma.teamConversationMember.findMany({
        where: { conversationId: input.conversationId, leftAt: null, staffId: { not: input.authorStaffId } },
        select: { staffId: true },
      })
      for (const m of members) {
        if (!kindByStaffId.has(m.staffId)) kindByStaffId.set(m.staffId, 'DM')
      }
    }

    if (kindByStaffId.size === 0) return

    const prefs = await loadTeamEmailPreferences(Array.from(kindByStaffId.keys()))
    const specs: CandidateSpec[] = []
    for (const [staffId, kind] of kindByStaffId) {
      const p = prefs.get(staffId) ?? DEFAULT_TEAM_EMAIL_PREFERENCES
      if (!isKindEnabled(p, kind)) continue
      specs.push({
        staffId,
        kind,
        conversationId: input.conversationId,
        sourceId: input.messageId, // mirrors lib/team/notify.ts's sourceId convention
        actorName: input.authorName,
      })
    }
    await writeCandidates(specs, now)
  } catch (e) {
    console.warn('[team/email-notify] scheduleMessageEmailCandidates failed (non-fatal):', e)
  }
}

/**
 * Missed call. The ONLY authoritative source is the TeamCallRecord itself
 * reaching status 'MISSED' (the DM call-status vocabulary in
 * lib/team/calls.ts) — this function re-reads the record and refuses to
 * schedule anything for any other status, so "missed" is never inferred
 * from a client signal, a ring timeout, or the absence of an answer.
 *
 * GROUP/CHANNEL calls have no MISSED status at all in that vocabulary
 * (STARTED/ACTIVE/ENDED/FAILED), so they never produce a missed-call
 * email — by design, not omission.
 *
 * Recipients are the callee(s): participantIds minus the caller.
 */
export async function scheduleMissedCallEmailCandidates(callRecordId: string): Promise<void> {
  try {
    const now = new Date()
    const call = await prisma.teamCallRecord.findUnique({
      where: { id: callRecordId },
      select: {
        id: true, status: true, conversationId: true, callerId: true, participantIds: true,
        caller: { select: { name: true } },
      },
    })
    if (!call || call.status !== 'MISSED') return

    const participantIds = Array.isArray(call.participantIds) ? (call.participantIds as unknown as string[]) : []
    const calleeIds = Array.from(new Set(participantIds.filter(id => typeof id === 'string' && id !== call.callerId)))
    if (calleeIds.length === 0) return

    // Live membership re-check — a former member must never be emailed
    // about a call in a conversation they no longer belong to.
    const members = await prisma.teamConversationMember.findMany({
      where: { conversationId: call.conversationId, leftAt: null, staffId: { in: calleeIds } },
      select: { staffId: true },
    })
    const eligible = members.map(m => m.staffId)
    if (eligible.length === 0) return

    const prefs = await loadTeamEmailPreferences(eligible)
    const specs: CandidateSpec[] = eligible
      .filter(id => isKindEnabled(prefs.get(id) ?? DEFAULT_TEAM_EMAIL_PREFERENCES, 'MISSED_CALL'))
      .map(id => ({
        staffId: id,
        kind: 'MISSED_CALL' as const,
        conversationId: call.conversationId,
        sourceId: call.id,
        actorName: call.caller?.name ?? null,
      }))
    await writeCandidates(specs, now)
  } catch (e) {
    console.warn('[team/email-notify] scheduleMissedCallEmailCandidates failed (non-fatal):', e)
  }
}

/**
 * Group/private-channel invitation. Callers must pass ONLY staff who were
 * genuinely newly added (not already an active member) — the routes below
 * establish that before calling, and the (staffId, sourceId=conversationId,
 * kind) unique key is the second line of defence: re-adding someone who was
 * already invited before can never produce a second email.
 */
export async function scheduleInviteEmailCandidates(
  conversationId: string,
  invitedStaffIds: string[],
  inviterName: string,
): Promise<void> {
  try {
    const now = new Date()
    const ids = Array.from(new Set(invitedStaffIds.filter(Boolean)))
    if (ids.length === 0) return
    const prefs = await loadTeamEmailPreferences(ids)
    const specs: CandidateSpec[] = ids
      .filter(id => isKindEnabled(prefs.get(id) ?? DEFAULT_TEAM_EMAIL_PREFERENCES, 'INVITE'))
      .map(id => ({
        staffId: id,
        kind: 'INVITE' as const,
        conversationId,
        sourceId: conversationId, // mirrors notifyChannelInvite's own sourceId convention
        actorName: inviterName,
      }))
    await writeCandidates(specs, now)
  } catch (e) {
    console.warn('[team/email-notify] scheduleInviteEmailCandidates failed (non-fatal):', e)
  }
}
