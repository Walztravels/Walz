/**
 * Inbox conversation-history helpers (mobile scroll fix) — pure functions.
 *
 * The inbox store is Chatwoot; pages arrive newest-page-first with the
 * `before={oldest message id}` cursor. These helpers keep the client list
 * chronological, deduplicated, and safe to poll: refreshes MERGE new
 * messages instead of replacing the array (replacing dropped previously
 * loaded older pages and yanked the viewport to the bottom every poll).
 */

export interface HistoryMessage {
  id: number
  created_at: number   // epoch seconds (Chatwoot)
}

const byChrono = <M extends HistoryMessage>(a: M, b: M) =>
  a.created_at - b.created_at || a.id - b.id

/** Sort a raw page chronologically (stable: created_at, then id). */
export function sortPage<M extends HistoryMessage>(page: M[]): M[] {
  return [...page].sort(byChrono)
}

/** Merge a freshly polled latest page into the existing list.
 *  Existing messages (including older pages already loaded) are kept;
 *  only unseen messages are added. Returns the ids that were appended
 *  after the previous newest message (drives autoscroll/new-indicator). */
export function mergeLatest<M extends HistoryMessage>(
  existing: M[],
  latestPage: M[],
): { merged: M[]; appendedIds: number[] } {
  const known = new Set(existing.map(m => m.id))
  const fresh = latestPage.filter(m => !known.has(m.id))
  if (fresh.length === 0) return { merged: existing, appendedIds: [] }
  const newestExisting = existing.length ? existing[existing.length - 1] : null
  const merged = sortPage([...existing, ...fresh])
  const appendedIds = newestExisting
    ? fresh.filter(m => byChrono(m, newestExisting) > 0).map(m => m.id)
    : fresh.map(m => m.id)
  return { merged, appendedIds }
}

/** Prepend an older page fetched with `before={oldest id}`.
 *  Duplicates are dropped; `added === 0` means the beginning of the
 *  conversation has been reached. */
export function prependOlder<M extends HistoryMessage>(
  existing: M[],
  olderPage: M[],
): { merged: M[]; added: number } {
  const known = new Set(existing.map(m => m.id))
  const fresh = olderPage.filter(m => !known.has(m.id))
  if (fresh.length === 0) return { merged: existing, added: 0 }
  return { merged: sortPage([...fresh, ...existing]), added: fresh.length }
}

/** The cursor for the next older page. */
export function oldestCursor(messages: HistoryMessage[]): number | null {
  return messages.length ? messages[0].id : null
}

/** Within this distance of the bottom, new messages may auto-scroll. */
export const NEAR_BOTTOM_PX = 120

export function isNearBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX
}

/** Distance from the top at which the next older page loads. */
export const TOP_TRIGGER_PX = 80

// ── Stale-response guard (Phase 1, Agent A — Inbox Performance) ─────────────
//
// fetchMessages/refreshMessages had no protection against an out-of-order
// response: selecting conversation A then quickly B could let A's slower
// in-flight response resolve AFTER B's and overwrite `messages` with A's
// stale page (identity-confusion class). Same discipline as
// PaymentRequestDrawer's loadSeqRef, generalized to be keyed by an id (a
// conversation id here) so switching to a NEW id invalidates any in-flight
// request for the OLD one, not just a same-id race.

export interface SeqGuard {
  /** Call at the START of a request for `id`. Returns the seq to pass to
   *  isCurrent() once that request resolves. */
  next(id: number): number
  /** True if `seq` for `id` is still the most recent request issued for
   *  that id — i.e. nothing newer (same id or a different one) has started
   *  since. False means the response is stale and must be discarded. */
  isCurrent(id: number, seq: number): boolean
}

/** A tiny "latest request wins" guard. Plain closure state (not a React
 *  ref) — callers hold one instance per logical stream (e.g. one per
 *  useRef in a component) for its lifetime.
 *
 *  The counter is monotonic ACROSS ALL ids, not reset per id — resetting
 *  per id would let two different "generations" of a request for the SAME
 *  id collide on the same seq number after a detour to another id and
 *  back (id 5 → id 6 → id 5 again can otherwise reissue seq 1 for id 5
 *  twice), which would wrongly validate a genuinely stale first response
 *  as current. */
export function createSeqGuard(): SeqGuard {
  let globalSeq = 0
  let current = { id: 0, seq: 0 }
  return {
    next(id: number): number {
      globalSeq += 1
      current = { id, seq: globalSeq }
      return globalSeq
    },
    isCurrent(id: number, seq: number): boolean {
      return current.id === id && current.seq === seq
    },
  }
}
