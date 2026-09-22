/**
 * WhatsApp Broadcast V1 — the cron PROCESSOR.
 *
 * Drained by /api/cron/whatsapp-broadcast (Vercel Cron). Architecturally
 * the same shape as lib/team/email-processor.ts: bounded scan → atomic
 * conditional claim → act → record, with retries and backoff. One tick:
 *
 *   1. promote due SCHEDULED broadcasts to QUEUED,
 *   2. pick QUEUED/SENDING broadcasts that still have work,
 *      SKIPPING any that have been CANCELLED,
 *   3. claim a bounded batch of their recipients QUEUED → SENDING with a
 *      conditional updateMany, and act ONLY on rows the claim actually won,
 *   4. send each claimed row's approved template, with pacing,
 *   5. record SENT / FAILED / re-QUEUED-with-backoff,
 *   6. recompute the broadcast's counts from the rows and close it out.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────
 * Two guarantees, independent of each other:
 *
 *  (a) THE CLAIM. `updateMany({ where: { id, status: 'QUEUED' }, data: {
 *      status: 'SENDING' } })` is a single atomic UPDATE. Postgres
 *      serialises concurrent updates to the same row, so of two
 *      overlapping cron executions exactly one sees count === 1 and the
 *      other sees count === 0. Only the winner proceeds. No row is ever
 *      handed to two senders.
 *
 *  (b) THE MESSAGE-ID GATE. Before any Meta call, the row is re-read and
 *      refused if it already carries a metaMessageId. This is checked
 *      regardless of status and regardless of what triggered the attempt —
 *      a crash-recovery sweep, an operator re-queue, a duplicated cron —
 *      so a recipient that Meta has already accepted can never be sent a
 *      second message.
 *
 * ── RATE LIMITING ───────────────────────────────────────────────────────
 * Meta Cloud API's raw throughput (80 msg/s by default) is NOT the binding
 * constraint. The binding constraint is the WhatsApp Business Account's
 * messaging TIER, which caps business-initiated conversations per rolling
 * 24 hours (1K / 10K / 100K, and 250/day for an unverified number). A new
 * or lightly-used number sits at the bottom of that ladder, and blowing
 * through it gets the number quality-rated down or restricted.
 *
 * So: MAX_RECIPIENTS_PER_TICK = 25 with a 5-minute cadence — at most 300
 * messages/hour, 7,200/day theoretical, and in practice a campaign drains
 * gradually rather than in a burst. 25 messages paced at
 * INTER_MESSAGE_DELAY_MS = 250ms costs ~6s of the route's 60s
 * maxDuration, leaving ample headroom. Both constants are exported so the
 * numbers are testable and adjustable in one place if the account is
 * upgraded to a higher tier.
 */

import prisma from '@/lib/db'
import { sendBroadcastTemplate, type SendOutcome } from './sender'
import {
  DISPATCHED_STATUSES,
  SKIPPED_STATUSES,
  canTransitionBroadcast,
  terminalBroadcastStatus,
  type BroadcastStatus,
} from './lifecycle'

/** Recipients dispatched in ONE tick, across all broadcasts. */
export const MAX_RECIPIENTS_PER_TICK = 25
/** Broadcasts advanced in one tick (the rest wait for the next). */
export const MAX_BROADCASTS_PER_TICK = 3
/** Pacing between Meta calls inside one tick. */
export const INTER_MESSAGE_DELAY_MS = 250
/** After this many attempts a recipient is parked FAILED, never retried. */
export const MAX_SEND_ATTEMPTS = 3
/** First retry delay; doubles per attempt. */
export const RETRY_BACKOFF_BASE_MS = 5 * 60_000

export interface TickSummary {
  broadcastsPromoted: number
  broadcastsProcessed: number
  broadcastsCompleted: number
  claimed: number
  sent: number
  failed: number
  retried: number
  skippedAlreadyDispatched: number
  cancelledBroadcastsSkipped: number
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function backoffFor(attempts: number): Date {
  const factor = Math.pow(2, Math.max(0, attempts - 1))
  return new Date(Date.now() + RETRY_BACKOFF_BASE_MS * factor)
}

/**
 * Rewrite a broadcast's aggregate counters FROM the recipient rows.
 *
 * Deliberately a recomputation (groupBy) rather than an increment: an
 * incremented counter drifts the first time a webhook is redelivered, a
 * tick crashes mid-write, or a status arrives out of order. Recomputation
 * cannot drift — the rows are the truth and the counters are a cache of
 * them. Meta redelivers status callbacks routinely, so this matters.
 */
export async function recomputeBroadcastCounts(broadcastId: string): Promise<{
  total: number
  queued: number
  sending: number
  sent: number
  delivered: number
  read: number
  failed: number
  skipped: number
  dispatched: number
  outstanding: number
}> {
  const groups = await prisma.whatsAppBroadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { _all: true },
  })
  const by = (s: string) => groups.find(g => g.status === s)?._count._all ?? 0

  const queued = by('QUEUED')
  const sending = by('SENDING')
  const sent = by('SENT')
  const delivered = by('DELIVERED')
  const read = by('READ')
  const failed = by('FAILED')
  const skipped = SKIPPED_STATUSES.reduce((n, s) => n + by(s), 0)
  const total = groups.reduce((n, g) => n + g._count._all, 0)
  // Anything Meta accepted, whatever it did afterwards.
  const dispatched = DISPATCHED_STATUSES.reduce((n, s) => n + by(s), 0)

  await prisma.whatsAppBroadcast.update({
    where: { id: broadcastId },
    data: {
      recipientCount: total,
      sentCount: dispatched,
      deliveredCount: delivered + read,
      readCount: read,
      failedCount: failed,
      skippedCount: skipped,
    },
  })

  return {
    total, queued, sending, sent, delivered, read, failed, skipped,
    dispatched,
    outstanding: queued + sending,
  }
}

/**
 * THE guarded write. Filters `fromStatuses` through canTransitionBroadcast()
 * and only then writes `terminal` — over rows still in an eligible status.
 * This is the ONE place the processor writes a broadcast's own terminal
 * status, so it is also the one place that must ask canTransitionBroadcast()
 * rather than writing blindly. lifecycle.ts's transition table claims to be
 * enforced everywhere a broadcast's status changes; this is what actually
 * makes that true for the processor's closeouts, instead of just for the
 * schedule/cancel routes' narrower canScheduleBroadcast/canCancelBroadcast
 * guards.
 *
 * Every closeout site in this file — including the defensive no-template
 * branch below, which cannot derive its terminal status from recipient
 * counts the way the other two can — routes through here rather than
 * calling `prisma.whatsAppBroadcast.updateMany({ data: { status: ... } })`
 * directly, so the guard is genuinely universal rather than "universal
 * except for the one case that fires when something has already gone
 * wrong".
 *
 * `fromStatuses` is the set of statuses the broadcast could genuinely be
 * in at each call site — passed in rather than re-derived so the caller's
 * own reasoning about "what status can this be right now" stays visible
 * at the call site instead of being hidden in here.
 */
async function writeBroadcastTerminal(
  broadcastId: string,
  fromStatuses: readonly BroadcastStatus[],
  terminal: Extract<BroadcastStatus, 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED'>,
  now: Date,
  sentAt: Date | null,
): Promise<number> {
  const eligibleFrom = fromStatuses.filter(from => canTransitionBroadcast(from, terminal))
  // Should never be empty given today's BROADCAST_TRANSITIONS — but if the
  // table is ever narrowed, refuse to write an illegal transition rather
  // than doing it anyway just because the caller thinks it is "done".
  if (eligibleFrom.length === 0) return 0

  const closed = await prisma.whatsAppBroadcast.updateMany({
    where: { id: broadcastId, status: { in: eligibleFrom as BroadcastStatus[] } },
    data: { status: terminal, completedAt: now, sentAt },
  })
  return closed.count
}

/**
 * Recompute counts and, if nothing is left outstanding, close the
 * broadcast out to its terminal status via writeBroadcastTerminal().
 */
async function closeBroadcastIfDone(
  broadcastId: string,
  fromStatuses: readonly BroadcastStatus[],
  now: Date,
): Promise<number> {
  const counts = await recomputeBroadcastCounts(broadcastId)
  if (counts.outstanding !== 0) return 0

  const terminal = terminalBroadcastStatus({ dispatched: counts.dispatched, failed: counts.failed })
  return writeBroadcastTerminal(broadcastId, fromStatuses, terminal, now, counts.dispatched > 0 ? now : null)
}

/** Dispatch ONE claimed recipient row. Assumes the claim already won. */
async function dispatchClaimed(
  recipientId: string,
  broadcast: { templateName: string; templateLanguage: string },
  summary: TickSummary,
  fetchImpl?: typeof fetch,
): Promise<void> {
  // ── GUARANTEE (b): re-read and refuse anything already dispatched. ────
  const row = await prisma.whatsAppBroadcastRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, waId: true, metaMessageId: true, attempts: true, templateParamsSnapshot: true },
  })
  if (!row) return

  if (row.metaMessageId) {
    // Already accepted by Meta at some point. Never send again — just
    // restore the row to a truthful state.
    summary.skippedAlreadyDispatched += 1
    await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { id: recipientId, status: 'SENDING' },
      data: { status: 'SENT' },
    })
    return
  }

  if (!row.waId) {
    await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { id: recipientId, status: 'SENDING' },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: 'NO_NUMBER',
        failureReason: 'Recipient has no dispatchable WhatsApp number.',
      },
    })
    summary.failed += 1
    return
  }

  const paramValues = Array.isArray(row.templateParamsSnapshot)
    ? (row.templateParamsSnapshot as unknown[]).map(v => String(v))
    : []

  let outcome: SendOutcome
  try {
    outcome = await sendBroadcastTemplate({
      waId: row.waId,
      templateName: broadcast.templateName,
      templateLanguage: broadcast.templateLanguage,
      paramValues,
      fetchImpl,
    })
  } catch (e) {
    outcome = { ok: false, kind: 'TRANSIENT', code: 'THROWN', reason: (e as Error)?.message?.slice(0, 300) ?? 'send threw' }
  }

  if (outcome.ok) {
    await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { id: recipientId, status: 'SENDING' },
      data: {
        status: 'SENT',
        metaMessageId: outcome.metaMessageId,
        sentAt: new Date(),
        failureCode: null,
        failureReason: null,
        nextAttemptAt: null,
      },
    })
    summary.sent += 1
    return
  }

  const attempts = row.attempts
  const exhausted = outcome.kind === 'PERMANENT' || attempts >= MAX_SEND_ATTEMPTS

  if (exhausted) {
    await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { id: recipientId, status: 'SENDING' },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: outcome.code,
        failureReason: outcome.reason,
        nextAttemptAt: null,
      },
    })
    summary.failed += 1
    return
  }

  // Transient with attempts left — back to QUEUED behind a backoff.
  await prisma.whatsAppBroadcastRecipient.updateMany({
    where: { id: recipientId, status: 'SENDING' },
    data: {
      status: 'QUEUED',
      failureCode: outcome.code,
      failureReason: outcome.reason,
      nextAttemptAt: backoffFor(attempts),
    },
  })
  summary.retried += 1
}

export async function processWhatsAppBroadcasts(options: {
  now?: Date
  fetchImpl?: typeof fetch
} = {}): Promise<TickSummary> {
  const now = options.now ?? new Date()
  const summary: TickSummary = {
    broadcastsPromoted: 0,
    broadcastsProcessed: 0,
    broadcastsCompleted: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    skippedAlreadyDispatched: 0,
    cancelledBroadcastsSkipped: 0,
  }

  // ── 1. SCHEDULED and due → QUEUED (conditional, so a concurrent tick
  //       cannot promote the same broadcast twice). ─────────────────────
  const promoted = await prisma.whatsAppBroadcast.updateMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    data: { status: 'QUEUED', queuedAt: now },
  })
  summary.broadcastsPromoted = promoted.count

  // ── 2. Broadcasts with work to do. CANCELLED is not in this list, so a
  //       cancelled campaign is never picked up at all. ────────────────
  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    where: { status: { in: ['QUEUED', 'SENDING'] } },
    orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
    take: MAX_BROADCASTS_PER_TICK,
    select: { id: true, status: true, templateName: true, templateLanguage: true },
  })
  if (broadcasts.length === 0) return summary

  let budget = MAX_RECIPIENTS_PER_TICK

  for (const broadcast of broadcasts) {
    if (budget <= 0) break

    if (!broadcast.templateName || !broadcast.templateLanguage) {
      // Defensive only — believed unreachable in production. The ONLY
      // writers of QUEUED/SCHEDULED status are the schedule route
      // (app/api/.../[id]/schedule/route.ts), which validates the
      // template and refuses to queue without one, and the SCHEDULED→
      // QUEUED promotion just above, which carries that already-validated
      // template forward unchanged. So a QUEUED/SENDING broadcast with no
      // template should never exist; if it somehow does anyway, fail the
      // campaign loudly rather than inventing a message. Recipient rows
      // are deliberately left untouched here: this path is not expected
      // to have written any (schedule() writes the recipient snapshot
      // AFTER its own template validation), so there is nothing to
      // reconcile — adding cleanup for a state that cannot occur would be
      // complexity with nothing to verify it against. If this branch ever
      // turns out to be reachable after all, revisit and terminal-ize any
      // orphaned recipient rows too.
      //
      // The closeout itself still goes through the SAME centralized
      // mechanism as every other closeout in this file: counts are
      // recomputed from whatever recipient rows actually exist (zeroing
      // the counters in the expected shape of this scenario, where none
      // were ever written) so they are never left stale, and the write is
      // gated by writeBroadcastTerminal()'s canTransitionBroadcast()
      // filter rather than an unguarded updateMany. Unlike the other two
      // closeout sites, the terminal status here is FIXED at 'FAILED'
      // rather than derived via terminalBroadcastStatus(counts): this is
      // a broadcast-level configuration failure (no valid template to
      // send), not an outcome computed from recipient tallies — and
      // terminalBroadcastStatus({ dispatched: 0, failed: 0 }) would
      // otherwise report 'COMPLETED', which is exactly wrong here.
      await recomputeBroadcastCounts(broadcast.id)
      summary.broadcastsCompleted += await writeBroadcastTerminal(
        broadcast.id, ['QUEUED', 'SENDING'], 'FAILED', now, null,
      )
      continue
    }

    // ── 3. Claim a bounded batch, QUEUED → SENDING, atomically. ────────
    const due = await prisma.whatsAppBroadcastRecipient.findMany({
      where: {
        broadcastId: broadcast.id,
        status: 'QUEUED',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: budget,
      select: { id: true },
    })

    if (due.length === 0) {
      // Nothing left to dispatch — close the broadcast out if it is done.
      // The broadcast is still whatever it was selected as (QUEUED or
      // SENDING): this can fire from QUEUED when every recipient row was
      // already terminal (SKIPPED_*/FAILED) at snapshot time, so nothing
      // was ever claimed into SENDING at all.
      summary.broadcastsCompleted += await closeBroadcastIfDone(broadcast.id, ['QUEUED', 'SENDING'], now)
      continue
    }

    // Mark the broadcast SENDING before the first dispatch, so the UI and
    // the cancel guard both see that processing has begun.
    await prisma.whatsAppBroadcast.updateMany({
      where: { id: broadcast.id, status: 'QUEUED' },
      data: { status: 'SENDING', startedAt: now },
    })

    // ── LAST-MOMENT CANCELLATION CHECK ─────────────────────────────────
    // Re-read AFTER the SENDING flip: if an operator cancelled between
    // the scan and here, the flip matched zero rows and the status is
    // still CANCELLED — so nothing is claimed for this broadcast.
    const live = await prisma.whatsAppBroadcast.findUnique({
      where: { id: broadcast.id },
      select: { status: true },
    })
    if (!live || live.status === 'CANCELLED') {
      summary.cancelledBroadcastsSkipped += 1
      continue
    }

    summary.broadcastsProcessed += 1

    for (const candidate of due) {
      if (budget <= 0) break

      // ── GUARANTEE (a): the atomic claim. ─────────────────────────────
      const claim = await prisma.whatsAppBroadcastRecipient.updateMany({
        where: { id: candidate.id, status: 'QUEUED' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      })
      if (claim.count === 0) continue // another execution won this row

      summary.claimed += 1
      budget -= 1

      await dispatchClaimed(
        candidate.id,
        { templateName: broadcast.templateName, templateLanguage: broadcast.templateLanguage },
        summary,
        options.fetchImpl,
      )

      if (INTER_MESSAGE_DELAY_MS > 0 && budget > 0) await sleep(INTER_MESSAGE_DELAY_MS)
    }

    // ── 6. Counters always reflect the rows, then close out if done. ───
    // Guaranteed SENDING here: the flip above either just landed or the
    // broadcast was already SENDING from an earlier tick.
    summary.broadcastsCompleted += await closeBroadcastIfDone(broadcast.id, ['SENDING'], now)
  }

  console.info(
    `[wa-broadcast/cron] promoted=${summary.broadcastsPromoted} broadcasts=${summary.broadcastsProcessed} ` +
    `claimed=${summary.claimed} sent=${summary.sent} failed=${summary.failed} retried=${summary.retried} ` +
    `alreadyDispatched=${summary.skippedAlreadyDispatched} completed=${summary.broadcastsCompleted}`,
  )
  return summary
}
