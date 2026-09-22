/**
 * WhatsApp Broadcast V1 — the two state machines.
 *
 * Pure. The transition tables below are the ONLY definition of what may
 * follow what; routes and the processor ask this module rather than
 * hand-rolling `if (status === …)` checks, so a state machine change
 * cannot be applied in one place and forgotten in another.
 *
 * Both vocabularies are mirrored by TEXT + CHECK constraints in
 * prisma/migrations/whatsapp_broadcast_v1.sql (this repo's convention —
 * see TeamConversation.type — chosen over a native Postgres enum because
 * widening a CHECK is a trivial idempotent ALTER and ALTER TYPE … ADD
 * VALUE is not).
 */

// ── Broadcast ───────────────────────────────────────────────────────────

export const BROADCAST_STATUSES = [
  'DRAFT',
  'READY',
  'SCHEDULED',
  'QUEUED',
  'SENDING',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED',
  'CANCELLED',
] as const
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

/**
 * DRAFT → READY → SCHEDULED|QUEUED → SENDING → COMPLETED|PARTIAL_FAILURE|FAILED
 * with CANCELLED reachable from SCHEDULED and QUEUED (i.e. only while no
 * recipient has been claimed yet — see canCancelBroadcast).
 *
 * QUEUED → FAILED (direct, skipping SENDING) is also real: it is the
 * processor's closeout path when a broadcast's snapshot has nothing left
 * to dispatch the moment it is picked up — e.g. every recipient row was
 * already SKIPPED_* or FAILED (an unresolvable template parameter) at
 * snapshot time — so zero rows ever get claimed into SENDING before the
 * broadcast is closed out FAILED. See processor.ts's closeBroadcastIfDone.
 */
const BROADCAST_TRANSITIONS: Record<BroadcastStatus, readonly BroadcastStatus[]> = {
  // A draft may be re-validated back to READY, or edited and stay DRAFT.
  DRAFT: ['READY'],
  // READY may fall back to DRAFT when the campaign is edited again.
  READY: ['DRAFT', 'SCHEDULED', 'QUEUED'],
  SCHEDULED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['SENDING', 'CANCELLED', 'COMPLETED', 'FAILED'],
  SENDING: ['SENDING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED'],
  // Terminal.
  COMPLETED: [],
  PARTIAL_FAILURE: [],
  FAILED: [],
  CANCELLED: [],
}

export function isBroadcastStatus(v: unknown): v is BroadcastStatus {
  return typeof v === 'string' && (BROADCAST_STATUSES as readonly string[]).includes(v)
}

export function canTransitionBroadcast(from: string, to: string): boolean {
  if (!isBroadcastStatus(from) || !isBroadcastStatus(to)) return false
  return BROADCAST_TRANSITIONS[from].includes(to)
}

/**
 * Statuses from which a schedule/send request is still legitimate.
 *
 * THE DOUBLE-SUBMIT GUARD. Anything past READY has already had its
 * recipient snapshot written, so a second schedule/send attempt — a
 * double-click, a retried fetch, a replayed request — is rejected here
 * rather than producing a second snapshot. Paired with the database
 * UNIQUE(broadcast_id, normalized_number), the guarantee is belt AND
 * braces: even a racing pair of requests that both passed this check
 * cannot insert the same recipient twice.
 */
export const SCHEDULABLE_FROM: readonly BroadcastStatus[] = ['DRAFT', 'READY']

export function canScheduleBroadcast(status: string): boolean {
  return isBroadcastStatus(status) && SCHEDULABLE_FROM.includes(status)
}

/**
 * Cancellable only BEFORE processing begins. Once the processor has
 * claimed a recipient the broadcast is SENDING and messages are already
 * on Meta's wire — there is nothing left to cancel.
 */
export const CANCELLABLE_FROM: readonly BroadcastStatus[] = ['SCHEDULED', 'QUEUED']

export function canCancelBroadcast(status: string): boolean {
  return isBroadcastStatus(status) && CANCELLABLE_FROM.includes(status)
}

/**
 * The terminal status implied by the final recipient tallies.
 *  - nothing dispatched at all and at least one failure  → FAILED
 *  - some dispatched, some failed                        → PARTIAL_FAILURE
 *  - otherwise                                           → COMPLETED
 * (An all-skipped broadcast is COMPLETED: nothing failed, there was simply
 * nobody eligible — which, given the consent position, is the common case.)
 */
export function terminalBroadcastStatus(counts: {
  dispatched: number
  failed: number
}): Extract<BroadcastStatus, 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED'> {
  if (counts.failed > 0 && counts.dispatched === 0) return 'FAILED'
  if (counts.failed > 0) return 'PARTIAL_FAILURE'
  return 'COMPLETED'
}

// ── Recipient ───────────────────────────────────────────────────────────

export const RECIPIENT_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'SKIPPED_OPT_OUT',
  'SKIPPED_NO_CONSENT',
  'SKIPPED_INVALID_NUMBER',
] as const
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number]

/** Rows in these states are never dispatched and never change again. */
export const SKIPPED_STATUSES: readonly RecipientStatus[] = [
  'SKIPPED_OPT_OUT',
  'SKIPPED_NO_CONSENT',
  'SKIPPED_INVALID_NUMBER',
]

/** A message actually reached Meta for these. */
export const DISPATCHED_STATUSES: readonly RecipientStatus[] = ['SENT', 'DELIVERED', 'READ']

export function isRecipientStatus(v: unknown): v is RecipientStatus {
  return typeof v === 'string' && (RECIPIENT_STATUSES as readonly string[]).includes(v)
}

/**
 * QUEUED → SENDING → SENT → DELIVERED → READ, with FAILED and the three
 * SKIPPED_* states terminal.
 *
 * SENDING → QUEUED exists for the transient-error retry path.
 */
const RECIPIENT_TRANSITIONS: Record<RecipientStatus, readonly RecipientStatus[]> = {
  QUEUED: ['SENDING', 'FAILED'],
  SENDING: ['SENT', 'FAILED', 'QUEUED'],
  SENT: ['DELIVERED', 'READ', 'FAILED'],
  // Meta may report `read` without a preceding `delivered`, and a message
  // can still fail after delivery (e.g. a later policy failure callback).
  DELIVERED: ['READ', 'FAILED'],
  READ: [],
  FAILED: [],
  SKIPPED_OPT_OUT: [],
  SKIPPED_NO_CONSENT: [],
  SKIPPED_INVALID_NUMBER: [],
}

export function canTransitionRecipient(from: string, to: string): boolean {
  if (!isRecipientStatus(from) || !isRecipientStatus(to)) return false
  return RECIPIENT_TRANSITIONS[from].includes(to)
}

/**
 * Meta's status callbacks arrive out of order surprisingly often (a
 * `delivered` can land after a `read`). Rank lets the webhook apply only
 * FORWARD progress and silently ignore a stale callback, instead of
 * walking a recipient backwards from READ to SENT.
 */
const PROGRESS_RANK: Partial<Record<RecipientStatus, number>> = {
  QUEUED: 0,
  SENDING: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
}

export function isForwardProgress(from: string, to: string): boolean {
  const a = PROGRESS_RANK[from as RecipientStatus]
  const b = PROGRESS_RANK[to as RecipientStatus]
  if (a === undefined || b === undefined) return false
  return b > a
}
