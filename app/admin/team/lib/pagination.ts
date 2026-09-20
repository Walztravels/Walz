/**
 * Walz Team Hub V1 — cursor-pagination merge/de-duplication helpers for
 * useTeamMessages.ts. Pure, framework-free so they're directly unit
 * testable (see __tests__/team-ui-pagination.test.ts).
 *
 * The messages API (GET .../messages) always returns a page already in
 * chronological order. There are two merge directions:
 *   - an OLDER page (fetched via `before=<oldestLoadedId>`) prepends to the
 *     front of what's loaded.
 *   - a NEWER/refresh batch (the realtime hook's poll-or-nudge safety net,
 *     which always re-fetches the latest window rather than trusting a
 *     partial realtime payload) is merged by id — upserting anything
 *     already loaded (picking up edits/deletes/reactions on messages still
 *     in view) and appending anything new, re-sorted by createdAt.
 */

export interface Identifiable {
  id: string
}

export interface Timestamped {
  createdAt: string | Date
}

/** Prepend an older page, dropping any id already present (defends against an overlapping cursor boundary). */
export function mergeOlderPage<T extends Identifiable>(existing: T[], olderPage: T[]): T[] {
  const existingIds = new Set(existing.map(m => m.id))
  const deduped = olderPage.filter(m => !existingIds.has(m.id))
  return [...deduped, ...existing]
}

/** Upsert a freshly-fetched "latest window" batch into the currently-loaded list, re-sorted chronologically. */
export function mergeLatestBatch<T extends Identifiable & Timestamped>(existing: T[], latestBatch: T[]): T[] {
  const byId = new Map(existing.map(m => [m.id, m] as const))
  for (const message of latestBatch) byId.set(message.id, message)
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

/** Replace (or, if absent, append) a single message — used for optimistic-send reconciliation and single-message edits. */
export function upsertMessage<T extends Identifiable>(existing: T[], updated: T): T[] {
  const idx = existing.findIndex(m => m.id === updated.id)
  if (idx === -1) return [...existing, updated]
  const next = existing.slice()
  next[idx] = updated
  return next
}

/** Remove a message by id (used to roll back a failed optimistic send). */
export function removeMessage<T extends Identifiable>(existing: T[], id: string): T[] {
  return existing.filter(m => m.id !== id)
}
