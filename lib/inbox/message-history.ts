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
